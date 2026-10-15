// Thin client for the public Deezer API (no auth). Deezer allows ~50 requests
// per 5 s per IP; a tiny sliding-window limiter keeps us well under that.

import { db } from '../db/index.js';
import { isSameSong } from './tracks.js';

const API = 'https://api.deezer.com';
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 40;
const sent: number[] = [];

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > WINDOW_MS) sent.shift();
    if (sent.length < MAX_PER_WINDOW) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 10));
  }
}

export class DeezerError extends Error {
  constructor(message: string, readonly transient = false) {
    super(message);
  }
}

// Deezer answers its quota errors with HTTP 200 and error code 4.
const QUOTA_EXCEEDED = 4;

async function getOnce<T>(path: string): Promise<T> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new DeezerError('Deezer unreachable', true);
  }
  if (!res.ok) throw new DeezerError(`Deezer HTTP ${res.status}`, res.status >= 500 || res.status === 429);
  const body = await res.json() as T & { error?: { message?: string; code?: number } };
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new DeezerError(`Deezer: ${body.error.message ?? 'error'}`, body.error.code === QUOTA_EXCEEDED);
  }
  return body;
}

// A long import makes hundreds of calls: a quota hiccup or a timeout must not
// silently drop a track, so transient failures are retried with a backoff.
async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getOnce<T>(path);
    } catch (e) {
      if (!(e instanceof DeezerError) || !e.transient || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export interface DeezerTrack {
  id: number;
  readable: boolean;
  title: string;
  title_short: string;
  isrc?: string;
  duration: number;
  rank: number;
  preview: string;
  artist: { id: number; name: string };
  album: { id: number; title: string; cover_small?: string; cover_medium?: string; cover_big?: string };
}

const playable = (t: DeezerTrack) => t.readable !== false && Boolean(t.preview);

export async function searchTracks(query: string, limit = 10): Promise<DeezerTrack[]> {
  const body = await get<{ data: DeezerTrack[] }>(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
  return body.data.filter(playable);
}

export async function searchArtists(query: string, limit = 3): Promise<{ id: number; name: string; nb_fan: number }[]> {
  const body = await get<{ data: { id: number; name: string; nb_fan: number }[] }>(
    `/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return body.data;
}

export async function getArtistTop(id: number, limit = 50): Promise<DeezerTrack[]> {
  const body = await get<{ data: DeezerTrack[] }>(`/artist/${id}/top?limit=${limit}`);
  return body.data.filter(playable);
}

export async function getTrack(id: number | `isrc:${string}`): Promise<DeezerTrack> {
  return get<DeezerTrack>(`/track/${id}`);
}

// Resolve a Spotify track to a playable Deezer one: ISRC first, then a strict
// artist+title search. Returns null when Deezer has no playable equivalent.
export async function findPlayable(isrc: string | undefined, title: string, artist: string): Promise<DeezerTrack | null> {
  if (isrc) {
    try {
      const byIsrc = await getTrack(`isrc:${isrc}`);
      if (playable(byIsrc)) return byIsrc;
    } catch (e) {
      if (!(e instanceof DeezerError) || e.transient) throw e;
    }
  }
  const clean = (s: string) => s.replace(/"/g, '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '');
  const strict = await searchTracks(`artist:"${clean(artist)}" track:"${clean(title)}"`, 5);
  if (strict[0]) return strict[0];
  // The strict query misses "feat." credits and differently spelled artists:
  // a plain search, kept only when title and artist really match.
  const loose = await searchTracks(`${clean(artist)} ${clean(title)}`, 10);
  return loose.find((t) => isSameSong(
    { deezer_id: t.id, title: t.title_short || t.title, artist: t.artist.name },
    { deezer_id: -1, title, artist },
  )) ?? null;
}

export interface DeezerPlaylist {
  id: number;
  title: string;
  nb_tracks: number;
  picture_medium?: string;
}

export async function getPlaylist(id: string): Promise<DeezerPlaylist> {
  return get<DeezerPlaylist>(`/playlist/${encodeURIComponent(id)}`);
}

export async function getPlaylistTracks(id: string, max = 3000): Promise<DeezerTrack[]> {
  const out: DeezerTrack[] = [];
  for (let index = 0; index < max; index += 100) {
    const page = await get<{ data: DeezerTrack[]; next?: string }>(
      `/playlist/${encodeURIComponent(id)}/tracks?limit=100&index=${index}`,
    );
    out.push(...page.data.filter(playable));
    if (!page.next) break;
  }
  return out;
}

export interface DeezerUser {
  id: number;
  name: string;
  picture_medium?: string;
}

export function getUser(id: string | number): Promise<DeezerUser> {
  return get<DeezerUser>(`/user/${encodeURIComponent(String(id))}`);
}

export interface DeezerUserPlaylist {
  id: number;
  title: string;
  nb_tracks: number;
  public: boolean;
  is_loved_track: boolean;
  picture_medium?: string;
}

// A profile's playlists as shown publicly, its "Coups de cœur" included.
export async function getUserPlaylists(id: string | number, max = 200): Promise<DeezerUserPlaylist[]> {
  const out: DeezerUserPlaylist[] = [];
  for (let index = 0; index < max; index += 100) {
    const page = await get<{ data: DeezerUserPlaylist[]; next?: string }>(
      `/user/${encodeURIComponent(String(id))}/playlists?limit=100&index=${index}`,
    );
    out.push(...page.data);
    if (!page.next) break;
  }
  return out.filter((p) => p.public || p.is_loved_track);
}

// The Deezer profile a player linked (see deezer_links in schema.sql).
export function getDeezerLink(userId: number) {
  return db.get<{ deezer_user_id: number; name: string; image: string | null }>(
    'SELECT deezer_user_id, name, image FROM deezer_links WHERE user_id = ?', [userId],
  );
}

// A profile's taste as public data shows it: most played tracks, then latest
// favourites. Only tracks with a preview are kept.
export async function getUserTasteTracks(id: string | number): Promise<DeezerTrack[]> {
  const [top, favourites] = await Promise.all([
    get<{ data: DeezerTrack[] }>(`/user/${encodeURIComponent(String(id))}/charts/tracks?limit=50`).catch(() => ({ data: [] })),
    get<{ data: DeezerTrack[] }>(`/user/${encodeURIComponent(String(id))}/tracks?limit=50`).catch(() => ({ data: [] })),
  ]);
  return [...top.data, ...favourites.data].filter(playable);
}

// A profile id, deezer.com/…/profile/<id>, or a link.deezer.com share link.
// Share links are resolved by following their redirect, and only for that host.
export async function parseProfileRef(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const direct = trimmed.match(/deezer\.com\/(?:[a-z]{2}\/)?profile\/(\d+)/i);
  if (direct) return direct[1];
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'link.deezer.com') return null;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) }).catch(() => null);
  return res?.url.match(/deezer\.com\/(?:[a-z]{2}\/)?profile\/(\d+)/i)?.[1] ?? null;
}

// Accepts a bare id, deezer.com/…/playlist/<id> or a link.deezer.com short link
// that has already been expanded by the caller.
export function parsePlaylistRef(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
  return match ? match[1] : null;
}

// Preview bytes are cached briefly: one Songless game asks for the same clip up
// to seven times, and the signed CDN URL lives ~15 minutes anyway.
const previewCache = new Map<number, { bytes: Buffer; at: number }>();
const PREVIEW_TTL = 10 * 60 * 1000;
const PREVIEW_CACHE_MAX = 64;

export async function getPreviewBytes(deezerId: number): Promise<Buffer> {
  const hit = previewCache.get(deezerId);
  if (hit && Date.now() - hit.at < PREVIEW_TTL) return hit.bytes;

  const track = await getTrack(deezerId);
  if (!track.preview) throw new DeezerError('No preview available');
  const res = await fetch(track.preview, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new DeezerError(`Preview HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  previewCache.set(deezerId, { bytes, at: Date.now() });
  if (previewCache.size > PREVIEW_CACHE_MAX) {
    previewCache.delete(previewCache.keys().next().value!);
  }
  return bytes;
}
