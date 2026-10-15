import { db } from '../db/index.js';
import { getTrack } from './deezer.js';
import { getTrackByDeezerId, getTrackById, isSameSong } from './tracks.js';
import { HttpError } from '../errors.js';

// Listening time unlocked at each of the 4 attempts. A wrong guess or a skip
// moves one step; finding the song scores 4 points down to 1.
export const STEPS_MS = [500, 2000, 5000, 10000];
export const MAX_STEPS = STEPS_MS.length;
const PREVIEW_MS = 30000;

// Old rows may still carry the retired daily modes.
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

type Guess =
  | { kind: 'skip' }
  // Hints were retired; old games may still list them.
  | { kind: 'hint'; label: string; text: string }
  | { kind: 'wrong'; title: string; artist: string }
  | { kind: 'right'; title: string; artist: string };

export function scoreFor(step: number): number {
  return MAX_STEPS - step;
}

// Bytes to serve for a given unlocked duration. Deezer previews are 30 s of CBR
// MP3, so a proportional cut is accurate to a frame; the margin covers decoder
// priming. The client stops playback at exactly `ms` anyway.
export function sliceLength(totalBytes: number, ms: number): number {
  const MARGIN = 2048;
  return Math.min(totalBytes, Math.ceil((totalBytes * ms) / PREVIEW_MS) + MARGIN);
}

export async function poolTrackIds(sourceId: number): Promise<number[]> {
  const rows = await db.all<{ track_id: number }>('SELECT track_id FROM source_tracks WHERE source_id = ?', [sourceId]);
  return rows.map((r) => r.track_id);
}

// --- games -------------------------------------------------------------------

export async function getOwnedGame(id: number, userId: number): Promise<GameRow> {
  const game = await db.get<GameRow>('SELECT * FROM songless_games WHERE id = ?', [id]);
  if (!game || game.user_id !== userId) throw new GameError('Game not found', 404);
  return game;
}

export async function startGame(userId: number, sourceId: number): Promise<GameRow> {
  const pool = await poolTrackIds(sourceId);
  if (pool.length === 0) throw new GameError('This playlist has no playable tracks', 409);
  // Avoid repeating the user's last 50 tracks while the playlist allows it.
  const recent = new Set((await db.all<{ track_id: number }>(`
    SELECT track_id FROM songless_games WHERE user_id = ? ORDER BY id DESC LIMIT 50
  `, [userId])).map((r) => r.track_id));
  const fresh = pool.filter((id) => !recent.has(id));
  const choices = fresh.length ? fresh : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  return (await db.get<GameRow>(`
    INSERT INTO songless_games (user_id, mode, track_id, source_id) VALUES (?, 'free', ?, ?) RETURNING *
  `, [userId, pick, sourceId]))!;
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
    source_id: game.source_id,
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

export async function giveUp(game: GameRow): Promise<GameRow> {
  if (game.status !== 'playing') throw new GameError('Game is over', 409);
  const updated = await db.get<GameRow>(`
    UPDATE songless_games SET status = 'lost', score = 0, finished_at = now()
    WHERE id = ? AND status = 'playing' RETURNING *
  `, [game.id]);
  if (!updated) throw new GameError('Game is over', 409);
  return updated;
}

export async function skip(game: GameRow): Promise<GameRow> {
  if (game.status !== 'playing') throw new GameError('Game is over', 409);
  return advance(game, { kind: 'skip' });
}
