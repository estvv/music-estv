import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { hashPassword } from './auth/crypto.js';
import { attachRoomSockets } from './realtime/roomSocket.js';
import {
  advanceStep, audioStarted, buzz, createRoom, endRound, joinRoom, nextRound, roomState, songlessPoints, startGame,
  submitAnswer, verdict, type Room,
} from './services/rooms.js';
import { hitsOnly } from './services/blindtest.js';
import { STEPS_MS } from './services/songless.js';

const app = createApp();
let hostId: number;
let sourceId: number;

beforeAll(async () => {
  const host = (await db.get<{ id: number }>(`INSERT INTO users (username, display_name, password_hash) VALUES ('host', 'Host', ?) RETURNING id`,
    [await hashPassword('host-password-123')]))!;
  hostId = host.id;
  const source = (await db.get<{ id: number }>(`INSERT INTO sources (kind, ref, name) VALUES ('deezer_playlist', 'r1', 'Party') RETURNING id`))!;
  sourceId = source.id;
  const songs = [[201, 'Song A', 'Artist A'], [202, 'Song B', 'Artist B'], [203, 'Song C', 'Artist C'], [204, 'Song D', 'Artist D']] as const;
  for (const [deezerId, title, artist] of songs) {
    const t = (await db.get<{ id: number }>('INSERT INTO tracks (deezer_id, title, artist) VALUES (?, ?, ?) RETURNING id', [deezerId, title, artist]))!;
    await db.run('INSERT INTO source_tracks (source_id, track_id) VALUES (?, ?)', [source.id, t.id]);
  }
});

const host = () => ({ id: hostId, display_name: 'Host' });
const rightChoice = (room: Room) => {
  const prepared = room.rounds[room.round!.index];
  return prepared.choices!.indexOf(prepared.trackId);
};

describe('room engine', () => {
  it('runs a multiple-choice round and closes it once everyone answered', async () => {
    const room = createRoom(host(), { sourceId, game: 'blindtest', answerMode: 'mcq', rounds: 2 });
    const alice = joinRoom(room, { name: 'Alice' });
    const bob = joinRoom(room, { name: 'Bob' });
    expect(() => joinRoom(room, { name: 'alice' })).toThrow(/taken/);

    await startGame(room);
    expect(room.round!.phase).toBe('loading');
    // Answers are closed until the host's audio actually starts.
    await expect(submitAnswer(room, alice, { choice: 0 })).rejects.toThrow(/closed/);

    audioStarted(room);
    // Phones see the choices but never the answer while playing.
    const view = roomState(room, { playerId: alice.id });
    expect(view.round!.choices).toHaveLength(4);
    expect(view.round!.reveal).toBeNull();

    await submitAnswer(room, alice, { choice: rightChoice(room) });
    expect(room.round!.phase).toBe('playing');
    await submitAnswer(room, bob, { choice: (rightChoice(room) + 1) % 4 });
    expect(room.round!.phase).toBe('reveal');
    expect(alice.score).toBeGreaterThanOrEqual(500);
    expect(bob.score).toBe(0);

    const reveal = roomState(room, { host: true }).round!.reveal!;
    expect(reveal.results.map((r) => r.name)).toEqual(['Alice', 'Bob']);

    nextRound(room);
    expect(room.round!.index).toBe(1);
  });

  it('pauses on a buzz and lets the host judge', () => {
    const room = createRoom(host(), { sourceId, game: 'blindtest', answerMode: 'buzzer', rounds: 3 });
    const alice = joinRoom(room, { name: 'Alice' });
    const bob = joinRoom(room, { name: 'Bob' });
    return startGame(room).then(() => {
      audioStarted(room, 1000);
      buzz(room, alice, 3000);
      expect(room.round!.phase).toBe('buzzed');
      expect(() => buzz(room, bob, 3100)).toThrow(/Too late/);

      verdict(room, false, 5000);
      expect(room.round!.phase).toBe('playing');
      expect(() => buzz(room, alice, 5100)).toThrow(/already buzzed/);

      buzz(room, bob, 6000);
      verdict(room, true, 7000);
      expect(room.round!.phase).toBe('reveal');
      expect(bob.score).toBeGreaterThan(0);
      expect(alice.score).toBe(0);
    });
  });

  it('plays songless with longer clips until everyone found', async () => {
    const room = createRoom(host(), { sourceId, game: 'songless', answerMode: 'type', rounds: 3 });
    const alice = joinRoom(room, { name: 'Alice' });
    const bob = joinRoom(room, { name: 'Bob' });
    await startGame(room);
    audioStarted(room);
    const answerDeezer = room.tracks.get(room.rounds[0].trackId)!.deezer_id;
    const wrongDeezer = [201, 202, 203, 204].find((d) => d !== answerDeezer)!;

    // Guesses resolve through Deezer; make the lookups local for the test.
    const deezer = await import('./services/deezer.js');
    const titles: Record<number, [string, string]> = { 201: ['Song A', 'Artist A'], 202: ['Song B', 'Artist B'], 203: ['Song C', 'Artist C'], 204: ['Song D', 'Artist D'] };
    const { vi } = await import('vitest');
    const spy = vi.spyOn(deezer, 'getTrack').mockImplementation(async (id) => ({
      id: id as number, title: titles[id as number][0], title_short: titles[id as number][0], artist: { id: 1, name: titles[id as number][1] },
    }) as Awaited<ReturnType<typeof deezer.getTrack>>);

    // Step 0: Alice wrong, Bob right → everyone has played this step, next clip.
    await submitAnswer(room, alice, { deezer_id: wrongDeezer });
    await expect(submitAnswer(room, alice, { deezer_id: answerDeezer })).rejects.toThrow(/next clip/);
    await submitAnswer(room, bob, { deezer_id: answerDeezer });
    expect(room.round!.step).toBe(1);
    expect(room.round!.phase).toBe('loading');
    expect(roomState(room, { host: true }).round!.clip_ms).toBe(STEPS_MS[1]);

    audioStarted(room);
    await submitAnswer(room, alice, { deezer_id: answerDeezer });
    expect(room.round!.phase).toBe('reveal');
    expect(bob.score).toBe(songlessPoints(0));
    expect(alice.score).toBe(songlessPoints(1));
    spy.mockRestore();
  });

  it('reveals songless after the last clip', async () => {
    const room = createRoom(host(), { sourceId, game: 'songless', answerMode: 'type', rounds: 3 });
    joinRoom(room, { name: 'Solo' });
    await startGame(room);
    for (let i = 0; i < 7; i++) advanceStep(room);
    expect(room.round!.phase).toBe('reveal');
  });

  it('saves account standings when the party ends', async () => {
    const room = createRoom(host(), { sourceId, game: 'blindtest', answerMode: 'mcq', rounds: 3 });
    joinRoom(room, { userId: hostId, userName: 'Host' });
    joinRoom(room, { name: 'Guest' });
    await startGame(room);
    for (let i = 0; i < 3; i++) {
      endRound(room);
      nextRound(room);
    }
    expect(room.phase).toBe('finished');
    await room.resultsSaved;
    const rows = await db.all('SELECT * FROM party_results WHERE room_code = ?', [room.code]);
    expect(rows).toEqual([expect.objectContaining({ user_id: hostId, players: 2, game: 'blindtest' })]);
  });

  it('keeps the most popular half for "hits only"', async () => {
    const ids = (await db.all<{ id: number }>('SELECT id FROM tracks WHERE deezer_id BETWEEN 201 AND 204 ORDER BY deezer_id')).map((r) => r.id);
    for (const [i, id] of ids.entries()) await db.run('UPDATE tracks SET rank = ? WHERE id = ?', [(i + 1) * 1000, id]);
    expect(await hitsOnly(ids, 1)).toEqual([ids[3], ids[2]]);
    expect(await hitsOnly(ids, 3)).toHaveLength(4);
  });

  it('gives rooms a 6-letter code without ambiguous letters', () => {
    const room = createRoom(host(), { sourceId, game: 'blindtest', answerMode: 'mcq', rounds: 3 });
    expect(room.code).toMatch(/^[A-HJ-NP-Z]{6}$/);
  });

  it('refuses "who liked it" without two linked accounts', async () => {
    const room = createRoom(host(), { game: 'wholiked', answerMode: 'mcq', rounds: 3 });
    joinRoom(room, { name: 'Guest' });
    await expect(startGame(room)).rejects.toThrow(/2 players/);
    expect(room.phase).toBe('lobby');
  });

  it('mixes Deezer and Spotify tastes, matching a shared song across services', async () => {
    const { vi } = await import('vitest');
    const deezer = await import('./services/deezer.js');
    const ids: number[] = [];
    for (const name of ['dz_a', 'dz_b']) {
      const u = (await db.get<{ id: number }>(`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, 'x') RETURNING id`, [name, name]))!;
      await db.run('INSERT INTO deezer_links (user_id, deezer_user_id, name) VALUES (?, ?, ?)', [u.id, u.id, name]);
      ids.push(u.id);
    }
    // Same song under two Deezer ids (two releases), plus one song each.
    const track = (id: number, title: string, artist: string) => ({
      id, readable: true, preview: 'https://x', title, title_short: title, duration: 200, rank: 1,
      artist: { id: 1, name: artist }, album: { id: 1, title },
    });
    const tastes: Record<number, ReturnType<typeof track>[]> = {
      [ids[0]]: [track(301, 'Shared Song', 'Band'), track(302, 'Only A', 'Solo')],
      [ids[1]]: [track(401, 'Shared Song (Remastered)', 'Band'), track(303, 'Only B', 'Duo')],
    };
    const spy = vi.spyOn(deezer, 'getUserTasteTracks').mockImplementation(async (id) => tastes[Number(id)] as never);

    const room = createRoom(host(), { game: 'wholiked', answerMode: 'mcq', rounds: 3 });
    const a = joinRoom(room, { userId: ids[0], userName: 'dz_a' });
    const b = joinRoom(room, { userId: ids[1], userName: 'dz_b' });
    await startGame(room);
    expect(room.rounds).toHaveLength(3);
    const shared = room.rounds.find((r) => room.tracks.get(r.trackId)!.title.startsWith('Shared Song'))!;
    expect(new Set(shared.owners)).toEqual(new Set([a.id, b.id]));
    spy.mockRestore();
  });
});

describe('room over WebSocket', () => {
  let server: ReturnType<typeof app.listen>;
  let base: string;

  beforeAll(async () => {
    server = app.listen(0);
    attachRoomSockets(server);
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
  });

  // Collects every message; `next` waits for the first one matching.
  function connect(cookie?: string) {
    const ws = new WebSocket(`ws://${base}/ws`, { headers: { origin: `http://${base}`, ...(cookie ? { cookie } : {}) } });
    const inbox: { type: string; [k: string]: unknown }[] = [];
    const waiters: { match: (m: { type: string; [k: string]: unknown }) => boolean; resolve: (m: unknown) => void }[] = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      for (const w of [...waiters]) {
        if (w.match(msg)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(msg);
        }
      }
    });
    const opened = new Promise((r) => ws.once('open', r));
    const next = <T = { type: string; [k: string]: unknown }>(match: (m: { type: string; [k: string]: unknown }) => boolean) =>
      new Promise<T>((resolve) => {
        const found = inbox.find(match);
        if (found) {
          inbox.splice(inbox.indexOf(found), 1);
          return resolve(found as T);
        }
        waiters.push({ match, resolve: resolve as (m: unknown) => void });
      });
    return { ws, opened, next, send: (m: object) => ws.send(JSON.stringify(m)) };
  }

  it('lets a guest join with a nickname and play against the host screen', async () => {
    const login = await request(app).post('/api/auth/login').send({ username: 'host', password: 'host-password-123' });
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const created = await request(app).post('/api/rooms').set('Cookie', cookie).send({ game: 'blindtest', answer_mode: 'mcq', rounds: 3, source_id: sourceId });
    const code = created.body.data.code as string;

    const info = await request(app).get(`/api/rooms/${code.toLowerCase()}`);
    expect(info.body.data).toMatchObject({ code, host_name: 'Host', phase: 'lobby' });

    // A guest cannot open the host screen.
    const intruder = connect();
    await intruder.opened;
    intruder.send({ type: 'hello', room: code, role: 'host' });
    await intruder.next((m) => m.type === 'error');

    const hostWs = connect(cookie);
    await hostWs.opened;
    hostWs.send({ type: 'hello', room: code, role: 'host' });
    await hostWs.next((m) => m.type === 'welcome');

    const guest = connect();
    await guest.opened;
    guest.send({ type: 'hello', room: code, role: 'player', name: 'Zoé' });
    const welcome = await guest.next<{ token: string; player_id: number }>((m) => m.type === 'welcome');
    expect(welcome.token).toBeTruthy();

    // Guest commands that belong to the host are refused.
    guest.send({ type: 'start' });
    await guest.next((m) => m.type === 'error' && m.message === 'Host only');

    // Guests can search with their room token, not without it.
    const noToken = await request(app).get(`/api/rooms/${code}/search?q=ab`);
    expect(noToken.status).toBe(403);

    hostWs.send({ type: 'start' });
    await hostWs.next((m) => m.type === 'state' && (m.state as { round?: { phase: string } }).round?.phase === 'loading');
    hostWs.send({ type: 'audio_started' });
    const playing = await guest.next<{ state: { round: { phase: string; choices: unknown[] } } }>(
      (m) => m.type === 'state' && (m.state as { round?: { phase: string } }).round?.phase === 'playing',
    );
    expect(playing.state.round.choices).toHaveLength(4);

    guest.send({ type: 'answer', choice: 0 });
    // Single player: one answer closes the round.
    const revealed = await hostWs.next<{ state: { round: { reveal: { results: { name: string }[] } } } }>(
      (m) => m.type === 'state' && Boolean((m.state as { round?: { reveal?: unknown } }).round?.reveal),
    );
    expect(revealed.state.round.reveal.results[0].name).toBe('Zoé');

    // Reconnecting with the token keeps the same seat and score.
    guest.ws.close();
    const again = connect();
    await again.opened;
    again.send({ type: 'hello', room: code, role: 'player', token: welcome.token });
    const rewelcome = await again.next<{ player_id: number }>((m) => m.type === 'welcome');
    expect(rewelcome.player_id).toBe(welcome.player_id);

    hostWs.send({ type: 'close' });
    await again.next((m) => m.type === 'closed');
    for (const c of [intruder, hostWs, again]) c.ws.close();
  });
});
