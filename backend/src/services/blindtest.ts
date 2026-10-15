import { db } from '../db/index.js';
import { getTrack } from './deezer.js';
import { poolTrackIds } from './songless.js';
import {
  getTrackByDeezerId, getTrackById, getTracksByIds, isSameSong, normalizeArtist, normalizeTitle, type Track,
} from './tracks.js';
import { HttpError } from '../errors.js';

export const CLIP_MS = 15000;
const MAX_POINTS = 1000;

export type AnswerMode = 'type' | 'mcq';

export class BlindtestError extends HttpError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

export interface RoundResult {
  kind: 'right' | 'artist' | 'wrong' | 'timeout';
  points: number;
  elapsed_ms: number;
  guess: { title: string; artist: string } | null;
}

interface Round {
  track_id: number;
  choices: number[] | null;
  started_at: number | null;
  result: RoundResult | null;
}

interface BlindtestRow {
  id: number;
  user_id: number;
  source_id: number | null;
  answer_mode: AnswerMode;
  rounds: string;
  current: number;
  score: number;
  status: 'playing' | 'finished';
}

// Speed bonus: a right answer is worth 500 at the end of the clip and up to
// 1000 when instant. Finding only the artist (typed mode) earns a third.
export function pointsFor(kind: RoundResult['kind'], elapsedMs: number): number {
  if (kind === 'wrong' || kind === 'timeout') return 0;
  const speed = Math.max(0, 1 - elapsedMs / CLIP_MS);
  const full = Math.round(MAX_POINTS / 2 + (MAX_POINTS / 2) * speed);
  return kind === 'right' ? full : Math.round(full / 3);
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const songKey = (t: Pick<Track, 'title' | 'artist'>) => `${normalizeTitle(t.title)}|${normalizeArtist(t.artist)}`;

// Picks N distinct songs, plus 3 decoys per round in MCQ mode. Decoys are the
// pool tracks closest in Deezer popularity, so a hit is not paired with three
// obscure B-sides. Pure: callers load the tracks.
export function buildRounds(tracks: Track[], count: number, mode: AnswerMode): Round[] {
  const seen = new Set<string>();
  const unique = shuffle(tracks).filter((t) => {
    const key = songKey(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length < count) throw new BlindtestError(`Not enough tracks: ${unique.length} available, ${count} needed`, 409);
  if (mode === 'mcq' && unique.length < 4) throw new BlindtestError('Need at least 4 different songs for multiple choice', 409);

  return unique.slice(0, count).map((answer) => {
    let choices: number[] | null = null;
    if (mode === 'mcq') {
      const decoys = unique
        .filter((t) => t.id !== answer.id)
        .sort((a, b) => Math.abs((a.rank ?? 0) - (answer.rank ?? 0)) - Math.abs((b.rank ?? 0) - (answer.rank ?? 0)))
        .slice(0, 8);
      choices = shuffle([answer.id, ...shuffle(decoys).slice(0, 3).map((t) => t.id)]);
    }
    return { track_id: answer.id, choices, started_at: null, result: null };
  });
}

// "Hits only": keep the most popular half of a playlist (Deezer rank), but
// never fewer tracks than the game needs.
export async function hitsOnly(trackIds: number[], minCount: number): Promise<number[]> {
  if (trackIds.length === 0) return trackIds;
  const ranked = await db.all<{ id: number }>(
    'SELECT id FROM tracks WHERE id = ANY(?) ORDER BY rank DESC NULLS LAST', [trackIds],
  );
  return ranked.slice(0, Math.max(minCount * 2, Math.ceil(ranked.length / 2))).map((r) => r.id);
}

// Pool of a source, optionally narrowed to hits, as tracks.
export async function poolTracks(sourceId: number, opts: { hits?: boolean; minCount: number }): Promise<Track[]> {
  let ids = await poolTrackIds(sourceId);
  if (ids.length === 0) throw new BlindtestError('This playlist has no playable tracks yet', 409);
  if (opts.hits) ids = await hitsOnly(ids, opts.minCount);
  return [...(await getTracksByIds(ids)).values()];
}

export async function startBlindtest(userId: number, opts: { sourceId: number; rounds: number; mode: AnswerMode; hits?: boolean }) {
  const tracks = await poolTracks(opts.sourceId, { hits: opts.hits, minCount: opts.rounds });
  const rounds = buildRounds(tracks, opts.rounds, opts.mode);
  return (await db.get<BlindtestRow>(`
    INSERT INTO blindtests (user_id, source_id, answer_mode, rounds) VALUES (?, ?, ?, ?) RETURNING *
  `, [userId, opts.sourceId, opts.mode, JSON.stringify(rounds)]))!;
}

export async function getOwnedBlindtest(id: number, userId: number): Promise<BlindtestRow> {
  const row = await db.get<BlindtestRow>('SELECT * FROM blindtests WHERE id = ?', [id]);
  if (!row || row.user_id !== userId) throw new BlindtestError('Blind test not found', 404);
  return row;
}

const reveal = (t: Track) => ({ title: t.title, artist: t.artist, cover_url: t.cover_url, deezer_id: t.deezer_id, spotify_id: t.spotify_id });

export async function publicBlindtest(row: BlindtestRow) {
  const rounds = JSON.parse(row.rounds) as Round[];
  const current = rounds[row.current];
  const source = row.source_id ? await db.get<{ name: string }>('SELECT name FROM sources WHERE id = ?', [row.source_id]) : undefined;
  const tracks = await getTracksByIds(rounds.flatMap((r) => [r.track_id, ...(r.choices ?? [])]));

  return {
    id: row.id,
    source_id: row.source_id,
    source_name: source?.name ?? 'Playlist supprimée',
    answer_mode: row.answer_mode,
    total: rounds.length,
    current: row.current,
    score: row.score,
    status: row.status,
    clip_ms: CLIP_MS,
    // Finished rounds are revealed; the current one only once answered.
    history: rounds.slice(0, row.current + (current?.result ? 1 : 0)).map((r) => ({
      ...r.result!,
      answer: reveal(tracks.get(r.track_id)!),
    })),
    round: current && row.status === 'playing' ? {
      index: row.current,
      answered: Boolean(current.result),
      choices: current.choices?.map((id, index) => {
        const t = tracks.get(id)!;
        return { index, title: t.title, artist: t.artist };
      }) ?? null,
    } : null,
  };
}

async function save(row: BlindtestRow, rounds: Round[], patch: Partial<BlindtestRow> = {}): Promise<BlindtestRow> {
  const next = { ...row, ...patch, rounds: JSON.stringify(rounds) };
  await db.run(`
    UPDATE blindtests SET rounds = ?, current = ?, score = ?, status = ?,
      finished_at = CASE WHEN ?::text = 'finished' THEN now() ELSE finished_at END
    WHERE id = ?
  `, [next.rounds, next.current, next.score, next.status, next.status, row.id]);
  return next;
}

// Called when the client fetches the clip: the speed clock starts here, not
// when the round was created.
export async function currentRoundTrack(row: BlindtestRow, now = Date.now()): Promise<Track> {
  if (row.status !== 'playing') throw new BlindtestError('Blind test is over', 409);
  const rounds = JSON.parse(row.rounds) as Round[];
  const round = rounds[row.current];
  if (round.started_at === null && !round.result) {
    round.started_at = now;
    await save(row, rounds);
  }
  return (await getTrackById(round.track_id))!;
}

export async function answer(
  row: BlindtestRow,
  input: { deezer_id?: number; choice?: number; give_up?: boolean },
  now = Date.now(),
) {
  if (row.status !== 'playing') throw new BlindtestError('Blind test is over', 409);
  const rounds = JSON.parse(row.rounds) as Round[];
  const round = rounds[row.current];
  if (round.result) throw new BlindtestError('Already answered', 409);

  const answerTrack = (await getTrackById(round.track_id))!;
  const elapsed = round.started_at === null ? CLIP_MS : Math.min(CLIP_MS, now - round.started_at);

  let kind: RoundResult['kind'] = 'timeout';
  let guess: RoundResult['guess'] = null;

  if (!input.give_up) {
    if (row.answer_mode === 'mcq') {
      const picked = round.choices?.[input.choice ?? -1];
      if (picked === undefined) throw new BlindtestError('Invalid choice');
      const t = (await getTrackById(picked))!;
      guess = { title: t.title, artist: t.artist };
      kind = picked === round.track_id ? 'right' : 'wrong';
    } else {
      if (!input.deezer_id) throw new BlindtestError('Missing guess');
      let guessed: { deezer_id: number; title: string; artist: string } | undefined = await getTrackByDeezerId(input.deezer_id);
      if (!guessed) {
        const t = await getTrack(input.deezer_id).catch(() => null);
        if (!t?.title) throw new BlindtestError('Unknown track');
        guessed = { deezer_id: t.id, title: t.title_short || t.title, artist: t.artist.name };
      }
      guess = { title: guessed.title, artist: guessed.artist };
      kind = isSameSong(guessed, answerTrack) ? 'right'
        : normalizeArtist(guessed.artist) === normalizeArtist(answerTrack.artist) ? 'artist'
        : 'wrong';
    }
  }

  const points = pointsFor(kind, elapsed);
  round.result = { kind, points, elapsed_ms: elapsed, guess };
  return save(row, rounds, { score: row.score + points });
}

export async function nextRound(row: BlindtestRow) {
  const rounds = JSON.parse(row.rounds) as Round[];
  if (!rounds[row.current]?.result) throw new BlindtestError('Answer the current round first', 409);
  const last = row.current + 1 >= rounds.length;
  return save(row, rounds, last ? { status: 'finished' } : { current: row.current + 1 });
}
