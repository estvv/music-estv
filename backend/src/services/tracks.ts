import { db } from '../db/index.js';
import type { DeezerTrack } from './deezer.js';

export interface Track {
  id: number;
  deezer_id: number;
  isrc: string | null;
  spotify_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  duration: number | null;
  rank: number | null;
}

const TRACK_COLUMNS = 'id, deezer_id, isrc, spotify_id, title, artist, album, cover_url, duration, rank';

export async function upsertDeezerTrack(t: DeezerTrack, spotifyId: string | null = null): Promise<Track> {
  return (await db.get<Track>(`
    INSERT INTO tracks (deezer_id, isrc, spotify_id, title, artist, album, cover_url, duration, rank)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (deezer_id) DO UPDATE SET
      isrc = COALESCE(excluded.isrc, tracks.isrc),
      spotify_id = COALESCE(excluded.spotify_id, tracks.spotify_id),
      title = excluded.title, artist = excluded.artist, album = excluded.album,
      cover_url = excluded.cover_url, duration = excluded.duration, rank = excluded.rank
    RETURNING ${TRACK_COLUMNS}
  `, [
    t.id,
    t.isrc ?? null,
    spotifyId,
    t.title_short || t.title,
    t.artist.name,
    t.album?.title ?? null,
    t.album?.cover_big ?? t.album?.cover_medium ?? null,
    t.duration ?? null,
    t.rank ?? null,
  ]))!;
}

export function getTrackById(id: number): Promise<Track | undefined> {
  return db.get<Track>(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ?`, [id]);
}

export function getTrackByDeezerId(deezerId: number): Promise<Track | undefined> {
  return db.get<Track>(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE deezer_id = ?`, [deezerId]);
}

export function getTrackBySpotifyId(spotifyId: string): Promise<Track | undefined> {
  return db.get<Track>(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE spotify_id = ?`, [spotifyId]);
}

// Several tracks in one query, as a map (blind test rounds, party rooms).
export async function getTracksByIds(ids: number[]): Promise<Map<number, Track>> {
  if (ids.length === 0) return new Map();
  const rows = await db.all<Track>(`SELECT ${TRACK_COLUMNS} FROM tracks WHERE id = ANY(?)`, [[...new Set(ids)]]);
  return new Map(rows.map((t) => [t.id, t]));
}

// Lower-case, strip accents, drop bracketed/dashed suffixes ("(Remastered 2011)",
// "- Radio Edit", "feat. X") and punctuation. Two releases of the same song
// normalise to the same string.
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, ' ')
    .replace(/\s+-\s+.*$/, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeArtist(s: string): string {
  return normalizeTitle(s).replace(/^the /, '');
}

export function isSameSong(
  a: { deezer_id: number; title: string; artist: string },
  b: { deezer_id: number; title: string; artist: string },
): boolean {
  if (a.deezer_id === b.deezer_id) return true;
  if (normalizeTitle(a.title) !== normalizeTitle(b.title)) return false;
  const artistA = normalizeArtist(a.artist);
  const artistB = normalizeArtist(b.artist);
  return artistA === artistB || artistA.includes(artistB) || artistB.includes(artistA);
}
