import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { getTrack } from './deezer.js';
import { getSpotifyLink, getTasteTracks, resolveSpotifyTrack } from './spotify.js';
import { getTrackByDeezerId, getTrackById, isSameSong, type Track } from './tracks.js';
import { HttpError } from '../errors.js';

// Listening time unlocked at each step. A wrong guess or a skip moves one step.
export const STEPS_MS = [100, 500, 1000, 2000, 4000, 8000, 16000];
export const MAX_STEPS = STEPS_MS.length;
const PREVIEW_MS = 30000;

export type Mode = 'daily' | 'daily_personal' | 'free';

export class GameError extends HttpError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

interface GameRow {
  id: number;
  user_id: number;
  mode: Mode;
  day: string | null;
  source_id: number | null;
  track_id: number;
  step: number;
  guesses: string;
  status: 'playing' | 'won' | 'lost';
  score: number;
  created_at: string;
  finished_at: string | null;
}

type Guess = { kind: 'skip' } | { kind: 'wrong'; title: string; artist: string } | { kind: 'right'; title: string; artist: string };

// "Today" follows Paris time so the daily flips at local midnight.
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

export function scoreFor(step: number): number {
  return MAX_STEPS - step;
}

// Deterministic choice: the same (seed, candidates) always gives the same pick,
// so two users asking for today's daily at the same time agree.
export function seededOrder<T>(items: T[], key: (t: T) => string, seed: string): T[] {
  const rank = (t: T) => createHash('sha256').update(`${seed}:${key(t)}`).digest().readUInt32BE(0);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

// Bytes to serve for a given unlocked duration. Deezer previews are 30 s of CBR
// MP3, so a proportional cut is accurate to a frame; the margin covers decoder
// priming. The client stops playback at exactly `ms` anyway.
export function sliceLength(totalBytes: number, ms: number): number {
  const MARGIN = 2048;
  return Math.min(totalBytes, Math.ceil((totalBytes * ms) / PREVIEW_MS) + MARGIN);
}

// --- daily selection ---------------------------------------------------------

async function recentDailyTrackIds(scope: string, days = 120): Promise<Set<number>> {
  const rows = await db.all<{ track_id: number }>(
    'SELECT track_id FROM daily_puzzles WHERE scope = ? AND day >= current_date - ?::int', [scope, days],
  );
  return new Set(rows.map((r) => r.track_id));
}

async function storedDaily(day: string, scope: string): Promise<Track | undefined> {
  const row = await db.get<{ track_id: number }>('SELECT track_id FROM daily_puzzles WHERE day = ? AND scope = ?', [day, scope]);
  return row ? getTrackById(row.track_id) : undefined;
}

async function saveDaily(day: string, scope: string, trackId: number) {
  // Two players opening the daily at the same moment: the first insert wins
  // and both read it back.
  await db.run('INSERT INTO daily_puzzles (day, scope, track_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [day, scope, trackId]);
}

export async function poolTrackIds(sourceId?: number): Promise<number[]> {
  const rows = sourceId
    ? await db.all<{ track_id: number }>('SELECT track_id FROM source_tracks WHERE source_id = ?', [sourceId])
    : await db.all<{ track_id: number }>(`
        SELECT DISTINCT st.track_id FROM source_tracks st
        JOIN sources s ON s.id = st.source_id WHERE s.in_daily_pool
      `);
  return rows.map((r) => r.track_id);
}

export async function globalDaily(day: string): Promise<Track> {
  const existing = await storedDaily(day, 'global');
  if (existing) return existing;

  const pool = await poolTrackIds();
  if (pool.length === 0) throw new GameError('The daily pool is empty: an admin must add a source first', 409);
  const recent = await recentDailyTrackIds('global');
  const fresh = pool.filter((id) => !recent.has(id));
  const [pick] = seededOrder(fresh.length ? fresh : pool, String, `global:${day}`);
  await saveDaily(day, 'global', pick);
  return (await storedDaily(day, 'global'))!;
}

export async function personalDaily(userId: number, day: string): Promise<Track> {
  const scope = `user:${userId}`;
  const existing = await storedDaily(day, scope);
  if (existing) return existing;
  if (!(await getSpotifyLink(userId))) throw new GameError('Link your Spotify account to play your personal daily', 409);

  const taste = await getTasteTracks(userId);
  if (taste.length === 0) throw new GameError('Your Spotify has no top tracks or likes yet', 409);

  const recent = await recentDailyTrackIds(scope, 365);
  // Try candidates in seeded order until one has a playable Deezer preview.
  for (const candidate of seededOrder(taste, (t) => t.id, `${scope}:${day}`).slice(0, 15)) {
    const track = await resolveSpotifyTrack(candidate);
    if (track && !recent.has(track.id)) {
      await saveDaily(day, scope, track.id);
      return (await storedDaily(day, scope))!;
    }
  }
  throw new GameError('No playable track found in your Spotify today, try again later', 409);
}

// --- games -------------------------------------------------------------------

export async function getOwnedGame(id: number, userId: number): Promise<GameRow> {
  const game = await db.get<GameRow>('SELECT * FROM songless_games WHERE id = ?', [id]);
  if (!game || game.user_id !== userId) throw new GameError('Game not found', 404);
  return game;
}

async function insertGame(userId: number, mode: Mode, day: string | null, trackId: number, sourceId: number | null): Promise<GameRow> {
  return (await db.get<GameRow>(`
    INSERT INTO songless_games (user_id, mode, day, track_id, source_id) VALUES (?, ?, ?, ?, ?) RETURNING *
  `, [userId, mode, day, trackId, sourceId]))!;
}

export async function startGame(userId: number, mode: Mode, sourceId?: number): Promise<GameRow> {
  if (mode === 'free') {
    const pool = await poolTrackIds(sourceId);
    if (pool.length === 0) throw new GameError(sourceId ? 'This source has no playable tracks' : 'The pool is empty', 409);
    const recent = new Set((await db.all<{ track_id: number }>(`
      SELECT track_id FROM songless_games WHERE user_id = ? AND mode = 'free' ORDER BY id DESC LIMIT 50
    `, [userId])).map((r) => r.track_id));
    const fresh = pool.filter((id) => !recent.has(id));
    const choices = fresh.length ? fresh : pool;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    return insertGame(userId, 'free', null, pick, sourceId ?? null);
  }

  const day = today();
  const findExisting = () => db.get<GameRow>(
    'SELECT * FROM songless_games WHERE user_id = ? AND mode = ? AND day = ?', [userId, mode, day],
  );
  const existing = await findExisting();
  if (existing) return existing;

  const track = mode === 'daily' ? await globalDaily(day) : await personalDaily(userId, day);
  try {
    return await insertGame(userId, mode, day, track.id, null);
  } catch (e) {
    // Double click: the unique (user, mode, day) index already has today's game.
    const raced = await findExisting();
    if (raced) return raced;
    throw e;
  }
}

export async function publicState(game: GameRow) {
  const finished = game.status !== 'playing';
  const track = finished ? await getTrackById(game.track_id) : undefined;
  const step = Math.min(game.step, MAX_STEPS - 1);
  return {
    id: game.id,
    mode: game.mode,
    day: game.day,
    step: game.step,
    steps_ms: STEPS_MS,
    unlocked_ms: finished ? PREVIEW_MS : STEPS_MS[step],
    guesses: JSON.parse(game.guesses) as Guess[],
    status: game.status,
    score: game.score,
    // Never sent while playing: the client must not know the answer.
    answer: track ? {
      title: track.title, artist: track.artist, album: track.album, cover_url: track.cover_url,
      deezer_id: track.deezer_id, spotify_id: track.spotify_id,
    } : null,
  };
}

async function advance(game: GameRow, guess: Guess): Promise<GameRow> {
  const guesses = [...JSON.parse(game.guesses) as Guess[], guess];
  let { step, status, score } = game;

  if (guess.kind === 'right') {
    status = 'won';
    score = scoreFor(step);
  } else {
    step += 1;
    if (step >= MAX_STEPS) status = 'lost';
  }

  // `step = ?` in the WHERE: two concurrent guesses on the same step cannot
  // both apply.
  const updated = await db.get<GameRow>(`
    UPDATE songless_games SET step = ?, guesses = ?, status = ?, score = ?,
      finished_at = CASE WHEN ?::text != 'playing' THEN now() ELSE NULL END
    WHERE id = ? AND status = 'playing' AND step = ? RETURNING *
  `, [step, JSON.stringify(guesses), status, score, status, game.id, game.step]);
  if (!updated) throw new GameError('This guess was already played, refresh the page', 409);
  return updated;
}

export async function guess(game: GameRow, deezerId: number): Promise<GameRow> {
  if (game.status !== 'playing') throw new GameError('Game is over', 409);
  const answer = (await getTrackById(game.track_id))!;

  let guessed: { deezer_id: number; title: string; artist: string } | undefined = await getTrackByDeezerId(deezerId);
  if (!guessed) {
    const t = await getTrack(deezerId).catch(() => null);
    if (!t || !t.title) throw new GameError('Unknown track');
    guessed = { deezer_id: t.id, title: t.title_short || t.title, artist: t.artist.name };
  }

  const right = isSameSong(guessed, answer);
  return advance(game, { kind: right ? 'right' : 'wrong', title: guessed.title, artist: guessed.artist });
}

export async function skip(game: GameRow): Promise<GameRow> {
  if (game.status !== 'playing') throw new GameError('Game is over', 409);
  return advance(game, { kind: 'skip' });
}
