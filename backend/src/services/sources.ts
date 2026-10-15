import { db } from '../db/index.js';
import { getPlaylist, getPlaylistTracks as getDeezerPlaylistTracks, parsePlaylistRef } from './deezer.js';
import {
  getLikedTracks, getPlaylistInfo, getPlaylistTracks as getSpotifyPlaylistTracks, getProfileImage, getSpotifyLink, resolveSpotifyTrack,
} from './spotify.js';
import { upsertDeezerTrack } from './tracks.js';
import { HttpError } from '../errors.js';

export interface SourceRow {
  id: number;
  kind: 'deezer_playlist' | 'spotify_playlist' | 'spotify_liked';
  ref: string;
  name: string;
  owner_id: number | null;
  synced_at: string | null;
  created_at: string;
  source_size: number | null;
  is_public: boolean;
  image_url: string | null;
}

export class SourceError extends HttpError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

// Sync progress lives in memory: a Spotify playlist of a few hundred tracks
// needs one Deezer lookup per track, so syncing runs in the background.
const syncing = new Map<number, { done: number; total: number; error?: string }>();

// Public playlists plus the viewer's own private ones.
export async function listSources(viewerId: number) {
  const rows = await db.all<SourceRow & { owner_name: string | null; track_count: number; missing_count: number }>(`
    SELECT s.id, s.kind, s.ref, s.name, s.owner_id, s.is_public, s.image_url, s.synced_at, s.created_at, s.source_size,
      jsonb_array_length(s.missing) AS missing_count,
      u.display_name AS owner_name, COUNT(st.track_id) AS track_count
    FROM sources s
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN source_tracks st ON st.source_id = s.id
    WHERE s.is_public OR s.owner_id = ?
    GROUP BY s.id, u.display_name ORDER BY s.created_at DESC
  `, [viewerId]);
  return rows.map((r) => ({ ...r, sync: syncing.get(r.id) ?? null }));
}

export function getSource(id: number): Promise<SourceRow | undefined> {
  return db.get<SourceRow>('SELECT * FROM sources WHERE id = ?', [id]);
}

// A source the user may see and play: public, or their own. A private one of
// someone else answers 404, as if it did not exist.
export async function getVisibleSource(id: number, userId: number): Promise<SourceRow> {
  const source = await getSource(id);
  if (!source || (!source.is_public && source.owner_id !== userId)) throw new SourceError('Playlist not found', 404);
  return source;
}

export async function setPublic(id: number, value: boolean) {
  await db.run('UPDATE sources SET is_public = ? WHERE id = ?', [value, id]);
}

export async function createSource(input: {
  kind: SourceRow['kind'];
  ref: string;
  ownerId: number;
  isPublic: boolean;
}): Promise<SourceRow> {
  let ref: string;
  let name: string;
  let image: string | null = null;

  if (input.kind === 'deezer_playlist') {
    const parsed = parsePlaylistRef(input.ref);
    if (!parsed) throw new SourceError('Not a Deezer playlist id or URL');
    const playlist = await getPlaylist(parsed).catch(() => null);
    if (!playlist) throw new SourceError('Deezer playlist not found (is it public?)', 404);
    ref = parsed;
    name = playlist.title;
    image = playlist.picture_medium ?? null;
  } else if (input.kind === 'spotify_playlist') {
    const match = input.ref.trim().match(/(?:playlist[/:])?([A-Za-z0-9]{22})/);
    if (!match) throw new SourceError('Not a Spotify playlist id or URL');
    ref = match[1];
    ({ name, image } = await getPlaylistInfo(input.ownerId, ref));
  } else {
    const link = await getSpotifyLink(input.ownerId);
    if (!link) throw new SourceError('Link your Spotify account first', 409);
    ref = link.spotify_user_id;
    name = `Titres likés de ${link.spotify_name ?? link.spotify_user_id}`;
    image = await getProfileImage(input.ownerId).catch(() => null);
  }

  const existing = await db.get<SourceRow>(
    'SELECT * FROM sources WHERE kind = ? AND ref = ? AND owner_id = ?', [input.kind, ref, input.ownerId],
  );
  if (existing) throw new SourceError(`Already added as "${existing.name}"`, 409);

  const source = (await db.get<SourceRow>(`
    INSERT INTO sources (kind, ref, name, owner_id, is_public, image_url) VALUES (?, ?, ?, ?, ?, ?) RETURNING *
  `, [input.kind, ref, name, input.ownerId, input.isPublic, image]))!;

  startSync(source);
  return source;
}

export interface MissingTrack {
  title: string;
  artist: string;
  spotify_id: string | null;
}

export async function getSourceTracks(id: number) {
  const tracks = await db.all<{
    deezer_id: number; spotify_id: string | null; title: string; artist: string; album: string | null; cover_url: string | null;
  }>(`
    SELECT t.deezer_id, t.spotify_id, t.title, t.artist, t.album, t.cover_url
    FROM source_tracks st JOIN tracks t ON t.id = st.track_id
    WHERE st.source_id = ? ORDER BY st.position NULLS LAST, lower(t.artist), lower(t.title)
  `, [id]);
  const row = await db.get<{ missing: MissingTrack[] }>('SELECT missing FROM sources WHERE id = ?', [id]);
  return { tracks, missing: row?.missing ?? [] };
}

export async function deleteSource(id: number) {
  await db.run('DELETE FROM sources WHERE id = ?', [id]);
}

export function startSync(source: SourceRow) {
  if (syncing.get(source.id) && !syncing.get(source.id)!.error) return;
  syncing.set(source.id, { done: 0, total: 0 });
  syncSource(source)
    .then(() => syncing.delete(source.id))
    .catch((err) => {
      console.error(`Sync of source ${source.id} failed:`, err);
      syncing.set(source.id, { done: 0, total: 0, error: err instanceof Error ? err.message : 'Sync failed' });
    });
}

// Blocking variant for scripts (fixtures), which must not exit mid-sync.
export async function syncSourceNow(source: SourceRow) {
  syncing.set(source.id, { done: 0, total: 0 });
  try {
    await syncSource(source);
  } finally {
    syncing.delete(source.id);
  }
}

// Covers change on the services' side (new playlist art, new profile picture):
// refreshed on every sync. A failure keeps the old image.
export async function fetchSourceImage(source: SourceRow): Promise<string | null> {
  if (source.kind === 'deezer_playlist') return (await getPlaylist(source.ref)).picture_medium ?? null;
  if (!source.owner_id) return null;
  if (source.kind === 'spotify_playlist') return (await getPlaylistInfo(source.owner_id, source.ref)).image;
  return getProfileImage(source.owner_id);
}

async function syncSource(source: SourceRow) {
  const progress = syncing.get(source.id)!;
  const trackIds: number[] = [];
  const missing: MissingTrack[] = [];
  const image = await fetchSourceImage(source).catch(() => null);

  if (source.kind === 'deezer_playlist') {
    const tracks = await getDeezerPlaylistTracks(source.ref);
    progress.total = tracks.length;
    for (const t of tracks) {
      trackIds.push((await upsertDeezerTrack(t)).id);
      progress.done += 1;
    }
  } else {
    if (!source.owner_id) throw new Error('Spotify source has no owner anymore');
    const tracks = source.kind === 'spotify_liked'
      ? await getLikedTracks(source.owner_id)
      : await getSpotifyPlaylistTracks(source.owner_id, source.ref);
    progress.total = tracks.length;
    for (const t of tracks) {
      // A transient Deezer failure survives retries only when Deezer is really
      // down: abort the sync then, rather than saving a half-empty playlist.
      const resolved = await resolveSpotifyTrack(t);
      if (resolved) trackIds.push(resolved.id);
      else missing.push({ title: t.name, artist: t.artists.map((a) => a.name).join(', '), spotify_id: t.id });
      progress.done += 1;
    }
  }

  await db.tx(async (t) => {
    await t.run('DELETE FROM source_tracks WHERE source_id = ?', [source.id]);
    await t.run(`
      INSERT INTO source_tracks (source_id, track_id, position)
      SELECT ?, u.track_id, u.position FROM unnest(?::int[]) WITH ORDINALITY AS u(track_id, position)
      ON CONFLICT DO NOTHING
    `, [source.id, trackIds]);
    await t.run('UPDATE sources SET synced_at = now(), missing = ?::jsonb, source_size = ?, image_url = COALESCE(?, image_url) WHERE id = ?', [
      JSON.stringify(missing), progress.total, image, source.id,
    ]);
  });
}
