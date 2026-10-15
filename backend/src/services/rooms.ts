import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { HttpError } from '../errors.js';
import { buildRounds, CLIP_MS, pointsFor, poolTracks, type RoundResult } from './blindtest.js';
import { db } from '../db/index.js';
import { getDeezerLink, getTrack, getUserTasteTracks as getDeezerTaste } from './deezer.js';
import { MAX_STEPS, STEPS_MS } from './songless.js';
import { getSpotifyLink, getTasteTracks, resolveSpotifyTrack } from './spotify.js';
import { getTracksByIds, isSameSong, normalizeArtist, normalizeTitle, upsertDeezerTrack, type Track } from './tracks.js';

// Party rooms live in memory only: a room is an evening, and a restart simply
// ends it. The server is the authority on timing and scoring; the host screen
// plays the audio and the phones only ever receive text.

export type RoomGame = 'blindtest' | 'wholiked' | 'songless';
export type RoomAnswerMode = 'mcq' | 'type' | 'buzzer';

const MAX_ROOMS = 20;
const MAX_PLAYERS = 30;
const IDLE_MS = 2 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// 24^6 ≈ 190 million codes: not guessable by trying codes at random.
export const CODE_LENGTH = 6;
// Songless in a room: after each clip, players get this long to type a guess
// before the next, longer clip.
export const SONGLESS_ANSWER_MS = 12000;

export class RoomError extends HttpError {}

interface Player {
  id: number;
  token: string;
  name: string;
  userId: number | null;
  score: number;
  sockets: Set<WebSocket>;
}

interface PreparedRound {
  trackId: number;
  choices: number[] | null; // track ids (mcq blind test)
  owners: number[] | null; // player ids who own the track (who liked it)
}

type RoundPhase = 'loading' | 'playing' | 'buzzed' | 'reveal';

interface RoundState {
  index: number;
  phase: RoundPhase;
  startedAt: number | null;
  elapsedAtPause: number;
  answers: Map<number, RoundResult>;
  buzzer: number | null;
  lockedOut: Set<number>;
  timer: NodeJS.Timeout | null;
  // Songless only: current clip step, and who already guessed at this step.
  step: number;
  stepGuessed: Set<number>;
}

export interface Room {
  code: string;
  hostUserId: number;
  hostName: string;
  game: RoomGame;
  answerMode: RoomAnswerMode;
  sourceId: number | null;
  hits: boolean;
  totalRounds: number;
  phase: 'lobby' | 'preparing' | 'round' | 'finished';
  error: string | null;
  rounds: PreparedRound[];
  round: RoundState | null;
  players: Map<number, Player>;
  hostSockets: Set<WebSocket>;
  nextPlayerId: number;
  // Loaded once at game start: room state is rebuilt on every broadcast and
  // must not hit the database.
  tracks: Map<number, Track>;
  // "Who liked it?" answer options: players whose Spotify fed the game.
  contenders: number[];
  // Final standings being written to party_results (kept for tests/shutdown).
  resultsSaved: Promise<void> | null;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

function newCode(): string {
  for (;;) {
    const code = Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!rooms.has(code)) return code;
  }
}

export function createRoom(host: { id: number; display_name: string }, opts: {
  game: RoomGame;
  answerMode: RoomAnswerMode;
  sourceId?: number;
  rounds: number;
  hits?: boolean;
}): Room {
  purgeIdleRooms();
  if (rooms.size >= MAX_ROOMS) throw new RoomError('Too many open rooms, close one first', 429);
  if (opts.game === 'wholiked' && opts.answerMode !== 'mcq') {
    throw new RoomError('"Who liked it?" is multiple choice only');
  }
  if (opts.game === 'songless' && opts.answerMode !== 'type') {
    throw new RoomError('Songless is played by typing the title');
  }
  const room: Room = {
    code: newCode(),
    hostUserId: host.id,
    hostName: host.display_name,
    game: opts.game,
    answerMode: opts.answerMode,
    sourceId: opts.sourceId ?? null,
    hits: opts.hits ?? false,
    totalRounds: opts.rounds,
    phase: 'lobby',
    error: null,
    rounds: [],
    round: null,
    players: new Map(),
    hostSockets: new Set(),
    nextPlayerId: 1,
    lastActivity: Date.now(),
    tracks: new Map(),
    contenders: [],
    resultsSaved: null,
  };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function requireRoom(code: string): Room {
  const room = getRoom(code);
  if (!room) throw new RoomError('Room not found or closed', 404);
  return room;
}

export function purgeIdleRooms(now = Date.now()) {
  for (const room of rooms.values()) {
    if (now - room.lastActivity > IDLE_MS) closeRoom(room);
  }
}

export function closeRoom(room: Room) {
  if (room.round?.timer) clearTimeout(room.round.timer);
  rooms.delete(room.code);
  const message = JSON.stringify({ type: 'closed' });
  for (const ws of room.hostSockets) ws.send(message);
  for (const p of room.players.values()) for (const ws of p.sockets) ws.send(message);
}

// --- players -----------------------------------------------------------------

export function joinRoom(room: Room, opts: { name?: string; token?: string; userId?: number | null; userName?: string }): Player {
  if (opts.token) {
    const existing = [...room.players.values()].find((p) => p.token === opts.token);
    if (existing) return existing;
  }
  // A logged-in account rejoining from another tab gets its seat back.
  if (opts.userId) {
    const existing = [...room.players.values()].find((p) => p.userId === opts.userId);
    if (existing) return existing;
  }

  const name = (opts.userName ?? opts.name ?? '').trim().slice(0, 20);
  if (!name) throw new RoomError('Choose a nickname');
  if (room.players.size >= MAX_PLAYERS) throw new RoomError('The room is full');
  if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new RoomError('This nickname is already taken');
  }

  const player: Player = {
    id: room.nextPlayerId++,
    token: randomBytes(16).toString('base64url'),
    name,
    userId: opts.userId ?? null,
    score: 0,
    sockets: new Set(),
  };
  room.players.set(player.id, player);
  return player;
}

export function playerByToken(room: Room, token: string): Player | undefined {
  return [...room.players.values()].find((p) => p.token === token);
}

export function kick(room: Room, playerId: number) {
  const player = room.players.get(playerId);
  if (!player) return;
  for (const ws of player.sockets) {
    ws.send(JSON.stringify({ type: 'kicked' }));
    ws.close();
  }
  room.players.delete(playerId);
}

// --- game flow ---------------------------------------------------------------

export async function startGame(room: Room) {
  if (room.phase !== 'lobby' && room.phase !== 'finished') throw new RoomError('The game is already running', 409);
  if (room.players.size === 0) throw new RoomError('Wait for at least one player', 409);

  room.phase = 'preparing';
  room.error = null;
  try {
    room.rounds = room.game === 'wholiked' ? await buildWhoLikedRounds(room) : await buildBlindtestRounds(room);
    room.tracks = await getTracksByIds(room.rounds.flatMap((r) => [r.trackId, ...(r.choices ?? [])]));
  } catch (e) {
    room.phase = 'lobby';
    room.error = e instanceof Error ? e.message : 'Could not prepare the game';
    throw e;
  }
  for (const p of room.players.values()) p.score = 0;
  room.phase = 'round';
  startRound(room, 0);
}

async function buildBlindtestRounds(room: Room): Promise<PreparedRound[]> {
  if (!room.sourceId) throw new RoomError('Pick a playlist for this game');
  const pool = await poolTracks(room.sourceId, { hits: room.hits, minCount: room.totalRounds });
  return buildRounds(pool, room.totalRounds, room.answerMode === 'mcq' ? 'mcq' : 'type')
    .map((r) => ({ trackId: r.track_id, choices: r.choices, owners: null }));
}

// Each account player with a linked Spotify and/or Deezer contributes tracks
// from their top and likes. The same song on both services is recognised by
// normalised title + artist, so a song liked by several players (whatever their
// service) accepts each of them as a right answer.
interface TasteItem {
  key: string;
  resolve: () => Promise<Track | null>;
}

async function tasteOf(userId: number): Promise<TasteItem[]> {
  const items: TasteItem[] = [];
  if (await getSpotifyLink(userId)) {
    for (const t of await getTasteTracks(userId).catch(() => [])) {
      items.push({ key: songKey(t.name, t.artists[0]?.name ?? ''), resolve: () => resolveSpotifyTrack(t).catch(() => null) });
    }
  }
  const deezer = await getDeezerLink(userId);
  if (deezer) {
    for (const t of await getDeezerTaste(deezer.deezer_user_id).catch(() => [])) {
      items.push({ key: songKey(t.title_short || t.title, t.artist.name), resolve: () => upsertDeezerTrack(t).catch(() => null) });
    }
  }
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.key) && Boolean(seen.add(i.key)));
}

const songKey = (title: string, artist: string) => `${normalizeTitle(title)}|${normalizeArtist(artist)}`;

async function buildWhoLikedRounds(room: Room): Promise<PreparedRound[]> {
  const contenders: Player[] = [];
  const tasteByPlayer = new Map<number, TasteItem[]>();
  for (const p of room.players.values()) {
    if (!p.userId) continue;
    const taste = await tasteOf(p.userId);
    if (taste.length === 0) continue;
    contenders.push(p);
    tasteByPlayer.set(p.id, shuffle(taste));
  }
  room.contenders = contenders.map((p) => p.id);
  if (contenders.length < 2) {
    throw new RoomError('"Who liked it?" needs at least 2 players logged in with a linked Spotify or Deezer', 409);
  }

  const owners = new Map<string, Set<number>>();
  for (const p of contenders) {
    for (const t of tasteByPlayer.get(p.id)!) {
      if (!owners.has(t.key)) owners.set(t.key, new Set());
      owners.get(t.key)!.add(p.id);
    }
  }

  // Round-robin across players so nobody's taste dominates the game.
  const rounds: PreparedRound[] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (rounds.length < room.totalRounds && attempts < room.totalRounds * 4) {
    for (const p of contenders) {
      if (rounds.length >= room.totalRounds) break;
      const candidate = tasteByPlayer.get(p.id)!.find((t) => !used.has(t.key));
      attempts += 1;
      if (!candidate) continue;
      used.add(candidate.key);
      const track = await candidate.resolve();
      if (track) rounds.push({ trackId: track.id, choices: null, owners: [...owners.get(candidate.key)!] });
    }
    if (contenders.every((p) => tasteByPlayer.get(p.id)!.every((t) => used.has(t.key)))) break;
  }
  if (rounds.length === 0) throw new RoomError('No playable track found in the players\' accounts', 409);
  return shuffle(rounds);
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startRound(room: Room, index: number) {
  if (room.round?.timer) clearTimeout(room.round.timer);
  room.round = {
    index,
    phase: 'loading',
    startedAt: null,
    elapsedAtPause: 0,
    answers: new Map(),
    buzzer: null,
    lockedOut: new Set(),
    timer: null,
    step: 0,
    stepGuessed: new Set(),
  };
}

// The host screen reports when the music actually starts: that is when
// answers open and the clock runs, so a slow audio load costs nobody points.
export function audioStarted(room: Room, now = Date.now()) {
  const round = room.round;
  if (!round || round.phase !== 'loading') return;
  round.phase = 'playing';
  round.startedAt = now;
  if (room.game === 'songless') {
    const window = windowMs(room);
    if (round.timer) clearTimeout(round.timer);
    round.timer = setTimeout(() => {
      advanceStep(room);
      onChange(room);
    }, window + 300);
    return;
  }
  armTimer(room, CLIP_MS);
}

// How long answers stay open once the music starts.
function windowMs(room: Room) {
  return room.game === 'songless' ? STEPS_MS[room.round!.step] + SONGLESS_ANSWER_MS : CLIP_MS;
}

// Songless points: 1000 at the first (0.1 s) clip down to ~140 at the last.
export function songlessPoints(step: number) {
  return Math.round((1000 * (MAX_STEPS - step)) / MAX_STEPS);
}

// Next, longer clip; after the last one the round is revealed.
export function advanceStep(room: Room) {
  const round = room.round;
  if (!round || round.phase === 'reveal') return;
  if (round.timer) clearTimeout(round.timer);
  round.timer = null;
  if (round.step + 1 >= MAX_STEPS) {
    endRound(room);
    return;
  }
  round.step += 1;
  round.stepGuessed.clear();
  round.phase = 'loading';
  round.startedAt = null;
}

// Clip length the host must play for the current round.
export function clipMs(room: Room) {
  return room.game === 'songless' && room.round ? STEPS_MS[room.round.step] : CLIP_MS;
}

function armTimer(room: Room, ms: number) {
  const round = room.round!;
  if (round.timer) clearTimeout(round.timer);
  round.timer = setTimeout(() => {
    endRound(room);
    onChange(room);
  }, ms + 300);
}

function elapsed(round: RoundState, now: number) {
  return round.startedAt === null ? CLIP_MS : Math.min(CLIP_MS, now - round.startedAt);
}

export async function submitAnswer(
  room: Room,
  player: Player,
  input: { choice?: number; deezer_id?: number },
  now = Date.now(),
) {
  const round = room.round;
  if (!round || round.phase !== 'playing') throw new RoomError('Answers are closed');
  if (room.answerMode === 'buzzer') throw new RoomError('Use the buzzer');
  if (round.answers.has(player.id)) throw new RoomError('Already answered');
  if (room.game === 'songless') return submitSonglessGuess(room, player, input.deezer_id);

  const prepared = room.rounds[round.index];
  const answerTrack = trackOf(room, prepared.trackId);
  const ms = elapsed(round, now);
  let kind: RoundResult['kind'];
  let guess: RoundResult['guess'] = null;

  if (room.game === 'wholiked') {
    const target = room.players.get(input.choice ?? -1);
    if (!target) throw new RoomError('Invalid choice');
    guess = { title: target.name, artist: '' };
    kind = prepared.owners!.includes(target.id) ? 'right' : 'wrong';
  } else if (room.answerMode === 'mcq') {
    const picked = prepared.choices?.[input.choice ?? -1];
    if (picked === undefined) throw new RoomError('Invalid choice');
    const t = trackOf(room, picked);
    guess = { title: t.title, artist: t.artist };
    kind = picked === prepared.trackId ? 'right' : 'wrong';
  } else {
    if (!input.deezer_id) throw new RoomError('Missing guess');
    const t = await getTrack(input.deezer_id).catch(() => null);
    if (!t?.title) throw new RoomError('Unknown track');
    const guessed = { deezer_id: t.id, title: t.title_short || t.title, artist: t.artist.name };
    guess = { title: guessed.title, artist: guessed.artist };
    kind = isSameSong(guessed, answerTrack) ? 'right'
      : normalizeArtist(guessed.artist) === normalizeArtist(answerTrack.artist) ? 'artist' : 'wrong';
  }

  // The round may have closed while the Deezer lookup ran.
  if (room.round !== round || round.phase !== 'playing' || round.answers.has(player.id)) return;
  round.answers.set(player.id, { kind, points: pointsFor(kind, ms), elapsed_ms: ms, guess });
  if (round.answers.size >= room.players.size) endRound(room);
}

async function submitSonglessGuess(room: Room, player: Player, deezerId: number | undefined) {
  const round = room.round!;
  if (round.stepGuessed.has(player.id)) throw new RoomError('Wait for the next clip');
  if (!deezerId) throw new RoomError('Missing guess');
  const t = await getTrack(deezerId).catch(() => null);
  if (!t?.title) throw new RoomError('Unknown track');
  if (room.round !== round || round.phase !== 'playing' || round.answers.has(player.id)) return;

  const answerTrack = trackOf(room, room.rounds[round.index].trackId);
  const guessed = { deezer_id: t.id, title: t.title_short || t.title, artist: t.artist.name };
  if (isSameSong(guessed, answerTrack)) {
    round.answers.set(player.id, {
      kind: 'right', points: songlessPoints(round.step), elapsed_ms: STEPS_MS[round.step], guess: guessed,
    });
  } else {
    round.stepGuessed.add(player.id);
  }

  const players = [...room.players.keys()];
  if (players.every((id) => round.answers.has(id))) endRound(room);
  else if (players.every((id) => round.answers.has(id) || round.stepGuessed.has(id))) advanceStep(room);
}

export function buzz(room: Room, player: Player, now = Date.now()) {
  const round = room.round;
  if (room.answerMode !== 'buzzer') throw new RoomError('No buzzer in this game');
  if (!round || round.phase !== 'playing') throw new RoomError('Too late');
  if (round.lockedOut.has(player.id)) throw new RoomError('You already buzzed this round');
  if (round.timer) clearTimeout(round.timer);
  round.phase = 'buzzed';
  round.buzzer = player.id;
  round.elapsedAtPause = elapsed(round, now);
}

export function verdict(room: Room, correct: boolean, now = Date.now()) {
  const round = room.round;
  if (!round || round.phase !== 'buzzed' || round.buzzer === null) throw new RoomError('Nobody buzzed');
  const buzzer = round.buzzer;
  if (correct) {
    round.answers.set(buzzer, {
      kind: 'right', points: pointsFor('right', round.elapsedAtPause), elapsed_ms: round.elapsedAtPause, guess: null,
    });
    endRound(room);
    return;
  }
  // Wrong: that player is out for the round and the music resumes where it stopped.
  round.lockedOut.add(buzzer);
  round.buzzer = null;
  if (round.lockedOut.size >= room.players.size) {
    endRound(room);
    return;
  }
  round.phase = 'playing';
  round.startedAt = now - round.elapsedAtPause;
  armTimer(room, CLIP_MS - round.elapsedAtPause);
}

export function endRound(room: Room) {
  const round = room.round;
  if (!round || round.phase === 'reveal') return;
  if (round.timer) clearTimeout(round.timer);
  round.timer = null;
  round.phase = 'reveal';
  for (const p of room.players.values()) {
    const result = round.answers.get(p.id);
    if (result) p.score += result.points;
  }
}

export function nextRound(room: Room) {
  if (room.phase !== 'round' || room.round?.phase !== 'reveal') throw new RoomError('Finish the current round first', 409);
  if (room.round.index + 1 >= room.rounds.length) {
    room.phase = 'finished';
    room.round = null;
    room.resultsSaved = saveResults(room).catch((e) => console.error(`Could not save results of room ${room.code}:`, e));
    return;
  }
  startRound(room, room.round.index + 1);
}

// Account players keep a trace of the evening in their history.
async function saveResults(room: Room) {
  const standings = [...room.players.values()].sort((a, b) => b.score - a.score);
  await db.tx(async (t) => {
    for (const [i, p] of standings.entries()) {
      if (!p.userId) continue;
      await t.run(
        'INSERT INTO party_results (user_id, room_code, game, score, rank, players) VALUES (?, ?, ?, ?, ?, ?)',
        [p.userId, room.code, room.game, p.score, i + 1, standings.length],
      );
    }
  });
}

const trackOf = (room: Room, id: number) => room.tracks.get(id)!;

export function currentTrack(room: Room) {
  if (!room.round) throw new RoomError('No round in progress', 409);
  return trackOf(room, room.rounds[room.round.index].trackId);
}

// --- state -------------------------------------------------------------------

let changeListener: (room: Room) => void = () => undefined;
export function onRoomChange(listener: (room: Room) => void) {
  changeListener = listener;
}
function onChange(room: Room) {
  changeListener(room);
}

export function roomState(room: Room, viewer: { host: true } | { playerId: number }, now = Date.now()) {
  const round = room.round;
  const prepared = round ? room.rounds[round.index] : null;
  const isHost = 'host' in viewer;
  const reveal = round?.phase === 'reveal';
  const answerTrack = prepared && reveal ? trackOf(room, prepared.trackId) : null;

  const players = [...room.players.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: p.sockets.size > 0,
      answered: Boolean(round?.answers.has(p.id) || round?.lockedOut.has(p.id) || round?.stepGuessed.has(p.id)),
      account: p.userId !== null,
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id);

  const wholikedChoices = room.game === 'wholiked'
    ? room.contenders.map((id) => room.players.get(id)).filter((p): p is Player => Boolean(p)).map((p) => ({ index: p.id, title: p.name, artist: '' }))
    : null;

  return {
    code: room.code,
    game: room.game,
    answer_mode: room.answerMode,
    host_name: room.hostName,
    phase: room.phase,
    error: isHost ? room.error : null,
    total: room.rounds.length || room.totalRounds,
    players,
    round: round && prepared ? {
      index: round.index,
      phase: round.phase,
      clip_ms: clipMs(room),
      remaining_ms: round.phase === 'playing' && round.startedAt !== null ? Math.max(0, windowMs(room) - (now - round.startedAt)) : null,
      step: room.game === 'songless' ? round.step : null,
      steps: room.game === 'songless' ? MAX_STEPS : null,
      choices: round.phase === 'loading' ? null
        : wholikedChoices ?? prepared.choices?.map((id, index) => {
          const t = trackOf(room, id);
          return { index, title: t.title, artist: t.artist };
        }) ?? null,
      buzzer: round.buzzer !== null ? { id: round.buzzer, name: room.players.get(round.buzzer)?.name ?? '?' } : null,
      answered_count: round.answers.size,
      reveal: reveal && answerTrack ? {
        answer: { title: answerTrack.title, artist: answerTrack.artist, cover_url: answerTrack.cover_url },
        owners: prepared.owners?.map((id) => room.players.get(id)?.name ?? '?') ?? null,
        results: [...round.answers.entries()].map(([id, r]) => ({
          player_id: id, name: room.players.get(id)?.name ?? '?', kind: r.kind, points: r.points,
        })).sort((a, b) => b.points - a.points),
      } : null,
    } : null,
    you: 'playerId' in viewer ? {
      player_id: viewer.playerId,
      result: round?.answers.get(viewer.playerId) ?? null,
      locked_out: round?.lockedOut.has(viewer.playerId) ?? false,
      guessed_this_step: round?.stepGuessed.has(viewer.playerId) ?? false,
    } : null,
  };
}

export function touch(room: Room) {
  room.lastActivity = Date.now();
}
