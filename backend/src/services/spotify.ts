import { config } from '../config.js';
import { db } from '../db/index.js';
import { decrypt, encrypt } from '../auth/crypto.js';
import { findPlayable } from './deezer.js';
import { getTrackBySpotifyId, upsertDeezerTrack, type Track } from './tracks.js';
import { HttpError } from '../errors.js';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

// Asked once up front so lot 3 (Web Playback on the party host screen) never
// needs a re-link.
export const SPOTIFY_SCOPES = [
  'user-top-read',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export const redirectUri = () => `${config.publicUrl}/api/spotify/callback`;

export class SpotifyError extends HttpError {
  constructor(message: string, status = 502) {
    super(message, status);
  }
}

interface SpotifyLinkRow {
  user_id: number;
  spotify_user_id: string;
  spotify_name: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: number;
  scope: string;
}

export function getSpotifyLink(userId: number): Promise<SpotifyLinkRow | undefined> {
  return db.get<SpotifyLinkRow>('SELECT * FROM spotify_links WHERE user_id = ?', [userId]);
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri(),
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new SpotifyError(`Spotify token HTTP ${res.status}`, res.status === 400 ? 401 : 502);
  return res.json() as Promise<TokenResponse>;
}

export async function linkAccount(userId: number, code: string) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  if (!tokens.refresh_token) throw new SpotifyError('Spotify returned no refresh token');

  const me = await fetchJson<{ id: string; display_name?: string; images?: { url: string }[] | null }>(`${API}/me`, tokens.access_token);
  await db.run(`
    INSERT INTO spotify_links (user_id, spotify_user_id, spotify_name, spotify_image, access_token_enc, refresh_token_enc, expires_at, scope)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET
      spotify_user_id = excluded.spotify_user_id, spotify_name = excluded.spotify_name, spotify_image = excluded.spotify_image,
      access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
      expires_at = excluded.expires_at, scope = excluded.scope, linked_at = now()
  `, [
    userId, me.id, me.display_name ?? me.id, pickImage(me.images) ?? '',
    encrypt(tokens.access_token), encrypt(tokens.refresh_token),
    Date.now() + tokens.expires_in * 1000, tokens.scope,
  ]);
}

export async function unlinkAccount(userId: number) {
  await db.run('DELETE FROM spotify_links WHERE user_id = ?', [userId]);
}

export async function getAccessToken(userId: number): Promise<string> {
  const link = await getSpotifyLink(userId);
  if (!link) throw new SpotifyError('Spotify not linked', 409);
  if (link.expires_at - 60_000 > Date.now()) return decrypt(link.access_token_enc);

  let tokens: TokenResponse;
  try {
    tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(link.refresh_token_enc) });
  } catch (e) {
    // A revoked/expired refresh token means the link is dead: drop it so the UI
    // offers to re-link instead of failing forever.
    if (e instanceof SpotifyError && e.status === 401) {
      await unlinkAccount(userId);
      throw new SpotifyError('Spotify link expired, please re-link', 409);
    }
    throw e;
  }
  await db.run(`
    UPDATE spotify_links SET access_token_enc = ?, expires_at = ?,
      refresh_token_enc = COALESCE(?, refresh_token_enc)
    WHERE user_id = ?
  `, [
    encrypt(tokens.access_token), Date.now() + tokens.expires_in * 1000,
    tokens.refresh_token ? encrypt(tokens.refresh_token) : null, userId,
  ]);
  return tokens.access_token;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new SpotifyError('Spotify rate limit reached, try again later', 429);
  if (!res.ok) throw new SpotifyError(`Spotify HTTP ${res.status}`, res.status === 403 ? 403 : 502);
  return res.json() as Promise<T>;
}

async function spotifyGet<T>(userId: number, path: string): Promise<T> {
  return fetchJson<T>(path.startsWith('http') ? path : `${API}${path}`, await getAccessToken(userId));
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  external_ids?: { isrc?: string };
  is_local?: boolean;
  type?: string;
}

interface Paging<T> {
  items: T[];
  next: string | null;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  owned: boolean;
  total: number | null;
  image: string | null;
}

// Since Feb 2026, dev-mode apps can only read the items of playlists the user
// owns or collaborates on, so `owned` tells the UI which ones are usable.
export async function getMyPlaylists(userId: number): Promise<SpotifyPlaylistSummary[]> {
  const link = (await getSpotifyLink(userId))!;
  const out: SpotifyPlaylistSummary[] = [];
  let url: string | null = '/me/playlists?limit=50';
  while (url && out.length < 500) {
    const page: Paging<{
      id: string; name: string; collaborative: boolean; owner: { id: string };
      images?: { url: string }[] | null; items?: { total: number }; tracks?: { total: number };
    }> = await spotifyGet(userId, url);
    for (const p of page.items) {
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        owned: p.owner?.id === link.spotify_user_id || p.collaborative,
        total: p.items?.total ?? p.tracks?.total ?? null,
        image: p.images?.[0]?.url ?? null,
      });
    }
    url = page.next;
  }
  return out;
}

// Playlist entries moved from `track` to `item` in the Feb 2026 API; accept both.
type PlaylistEntry = { item?: SpotifyTrack | null; track?: SpotifyTrack | null };

export async function getPlaylistTracks(userId: number, playlistId: string, max = 3000): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let url: string | null = `/playlists/${encodeURIComponent(playlistId)}/items?limit=100`;
  while (url && out.length < max) {
    const page: Paging<PlaylistEntry> = await spotifyGet(userId, url);
    for (const entry of page.items) {
      const t = entry.item ?? entry.track;
      if (t && !t.is_local && (t.type ?? 'track') === 'track') out.push(t);
    }
    url = page.next;
  }
  return out;
}

// Images come largest first: the last one is the smallest (often 60 px), the
// middle one about 300 px, enough for a list thumbnail.
const pickImage = (images?: { url: string }[] | null) => (images?.length ? images[Math.min(1, images.length - 1)].url : null);

export async function getPlaylistInfo(userId: number, playlistId: string): Promise<{ name: string; image: string | null }> {
  const p = await spotifyGet<{ name: string; images?: { url: string }[] | null }>(
    userId, `/playlists/${encodeURIComponent(playlistId)}?fields=name,images`,
  );
  return { name: p.name, image: pickImage(p.images) };
}

// Profile picture of the linked account: the face of its "liked tracks" playlist.
export async function getProfileImage(userId: number): Promise<string | null> {
  const me = await spotifyGet<{ images?: { url: string }[] | null }>(userId, '/me');
  return pickImage(me.images);
}

// The user's taste: top tracks (mid + short term) and the 50 latest likes.
export async function getTasteTracks(userId: number): Promise<SpotifyTrack[]> {
  const [mid, short, liked] = await Promise.all([
    spotifyGet<Paging<SpotifyTrack>>(userId, '/me/top/tracks?limit=50&time_range=medium_term'),
    spotifyGet<Paging<SpotifyTrack>>(userId, '/me/top/tracks?limit=50&time_range=short_term'),
    spotifyGet<Paging<{ track: SpotifyTrack }>>(userId, '/me/tracks?limit=50'),
  ]);
  const seen = new Set<string>();
  return [...mid.items, ...short.items, ...liked.items.map((i) => i.track)].filter((t) => {
    if (!t || t.is_local || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export async function getLikedTracks(userId: number, max = 3000): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let url: string | null = '/me/tracks?limit=50';
  while (url && out.length < max) {
    const page: Paging<{ track: SpotifyTrack }> = await spotifyGet(userId, url);
    for (const { track } of page.items) {
      if (track && !track.is_local) out.push(track);
    }
    url = page.next;
  }
  return out;
}

// Map a Spotify track to a cached, Deezer-playable Track (null when Deezer has
// no playable equivalent).
export async function resolveSpotifyTrack(t: SpotifyTrack): Promise<Track | null> {
  const cached = await getTrackBySpotifyId(t.id);
  if (cached) return cached;
  const deezer = await findPlayable(t.external_ids?.isrc, t.name, t.artists[0]?.name ?? '');
  return deezer ? upsertDeezerTrack(deezer, t.id) : null;
}
