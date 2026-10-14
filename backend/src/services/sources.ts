import { db } from '../db/index.js';
import { getPlaylist, getPlaylistTracks as getDeezerPlaylistTracks, parsePlaylistRef } from './deezer.js';
import {
  getLikedTracks, getPlaylistName, getPlaylistTracks as getSpotifyPlaylistTracks, getSpotifyLink, resolveSpotifyTrack,
} from './spotify.js';
import { upsertDeezerTrack } from './tracks.js';
import { HttpError } from '../errors.js';

export interface SourceRow {
  id: number;
  kind: 'deezer_playlist' | 'spotify_playlist' | 'spotify_liked';
  ref: string;
  name: string;
  in_daily_pool: boolean;
  owner_id: number | null;
  synced_at: string | null;
  created_at: string;
}

export class SourceError extends HttpError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

// Sync progress lives in memory: a Spotify playlist of a few hundred tracks
// needs one Deezer lookup per track, so syncing runs in the background.
const syncing = new Map<number, { done: number; total: number; error?: string }>();

export async function listSources() {
  const rows = await db.all<SourceRow & { owner_name: string | null; track_count: number }>(`
    SELECT s.*, u.display_name AS owner_name, COUNT(st.track_id) AS track_count
    FROM sources s
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN source_tracks st ON st.source_id = s.id
    GROUP BY s.id, u.display_name ORDER BY s.created_at DESC
  `);
  return rows.map((r) => ({ ...r, sync: syncing.get(r.id) ?? null }));
}

export function getSource(id: number): Promise<SourceRow | undefined> {
  return db.get<SourceRow>('SELECT * FROM sources WHERE id = ?', [id]);
}

export async function createSource(input: {
  kind: SourceRow['kind'];
  ref: string;
  ownerId: number;
  inDailyPool: boolean;
  // Return the already-added source instead of failing on a duplicate.
  reuse?: boolean;
}): Promise<SourceRow> {
  let ref: string;
  let name: string;

  if (input.kind === 'deezer_playlist') {
    const parsed = parsePlaylistRef(input.ref);
    if (!parsed) throw new SourceError('Not a Deezer playlist id or URL');
    const playlist = await getPlaylist(parsed).catch(() => null);
    if (!playlist) throw new SourceError('Deezer playlist not found (is it public?)', 404);
    ref = parsed;
    name = playlist.title;
  } else if (input.kind === 'spotify_playlist') {
    const match = input.ref.trim().match(/(?:playlist[/:])?([A-Za-z0-9]{22})/);
    if (!match) throw new SourceError('Not a Spotify playlist id or URL');
    ref = match[1];
    name = await getPlaylistName(input.ownerId, ref);
  } else {
    const link = await getSpotifyLink(input.ownerId);
    if (!link) throw new SourceError('Link your Spotify account first', 409);
    ref = link.spotify_user_id;
    name = `Titres likés de ${link.spotify_name ?? link.spotify_user_id}`;
  }

  const existing = await db.get<SourceRow>('SELECT * FROM sources WHERE kind = ? AND ref = ?', [input.kind, ref]);
  if (existing && input.reuse) return existing;
  if (existing) throw new SourceError(`Already added as "${existing.name}"`, 409);

  const source = (await db.get<SourceRow>(`
    INSERT INTO sources (kind, ref, name, in_daily_pool, owner_id) VALUES (?, ?, ?, ?, ?) RETURNING *
  `, [input.kind, ref, name, input.inDailyPool, input.ownerId]))!;

  startSync(source);
  return source;
}

export async function setInDailyPool(id: number, value: boolean) {
  await db.run('UPDATE sources SET in_daily_pool = ? WHERE id = ?', [value, id]);
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

async function syncSource(source: SourceRow) {
  const progress = syncing.get(source.id)!;
  const trackIds: number[] = [];

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
      const resolved = await resolveSpotifyTrack(t).catch(() => null);
      if (resolved) trackIds.push(resolved.id);
      progress.done += 1;
    }
  }

  await db.tx(async (t) => {
    await t.run('DELETE FROM source_tracks WHERE source_id = ?', [source.id]);
    await t.run(`
      INSERT INTO source_tracks (source_id, track_id)
      SELECT ?, unnest(?::int[]) ON CONFLICT DO NOTHING
    `, [source.id, trackIds]);
    await t.run('UPDATE sources SET synced_at = now() WHERE id = ?', [source.id]);
  });
}
