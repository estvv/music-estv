import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { db } from './db/index.js';
import { hashPassword } from './auth/crypto.js';
import { STEPS_MS } from './services/songless.js';

// NODE_ENV=test makes db/index.ts open an in-memory database.
const app = createApp();

async function login(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0].split(';')[0];
}

let adminCookie: string;

beforeAll(async () => {
  await db.run('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, true)',
    ['admin', 'Admin', await hashPassword('temporary-pass')]);

  // A small pool, inserted straight into the cache so no Deezer call is needed
  // except for the audio (not exercised here).
  const source = (await db.get<{ id: number }>(`INSERT INTO sources (kind, ref, name, in_daily_pool) VALUES ('deezer_playlist', '1', 'Test', true) RETURNING id`))!;
  const tracks = [
    [101, 'Bohemian Rhapsody', 'Queen'],
    [102, 'Alors on danse', 'Stromae'],
    [103, 'One More Time', 'Daft Punk'],
    [104, 'Get Lucky', 'Daft Punk'],
  ] as const;
  for (const [deezerId, title, artist] of tracks) {
    const t = (await db.get<{ id: number }>('INSERT INTO tracks (deezer_id, title, artist) VALUES (?, ?, ?) RETURNING id', [deezerId, title, artist]))!;
    await db.run('INSERT INTO source_tracks (source_id, track_id) VALUES (?, ?)', [source.id, t.id]);
  }
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('logs in straight to the app, password change optional', async () => {
    adminCookie = await login('admin', 'temporary-pass');
    const users = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(users.status).toBe(200);

    const wrong = await request(app).post('/api/auth/password').set('Cookie', adminCookie)
      .send({ current: 'nope', next: 'a-much-better-password' });
    expect(wrong.status).toBe(400);
    const changed = await request(app).post('/api/auth/password').set('Cookie', adminCookie)
      .send({ current: 'temporary-pass', next: 'a-much-better-password' });
    expect(changed.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    expect(me.body.data).toMatchObject({ username: 'admin', is_admin: true });
  });

  it('has no public sign-up: only an admin creates accounts', async () => {
    const anonymous = await request(app).post('/api/admin/users').send({ username: 'bob', display_name: 'Bob' });
    expect(anonymous.status).toBe(401);

    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'bob', display_name: 'Bob' });
    expect(created.status).toBe(201);
    const bobCookie = await login('bob', created.body.data.password);

    const notAdmin = await request(app).post('/api/admin/users').set('Cookie', bobCookie)
      .send({ username: 'eve', display_name: 'Eve' });
    expect(notAdmin.status).toBe(403);
  });

  it('kills sessions of a disabled account', async () => {
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'carol', display_name: 'Carol' });
    const cookie = await login('carol', created.body.data.password);
    await request(app).patch(`/api/admin/users/${created.body.data.user.id}`).set('Cookie', adminCookie)
      .send({ disabled: true });
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });
});

describe('songless daily', () => {
  it('hides the answer while playing, then wins after a skip', async () => {
    const start = await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({ mode: 'daily' });
    expect(start.status).toBe(200);
    expect(start.body.data).toMatchObject({ status: 'playing', step: 0, unlocked_ms: STEPS_MS[0], answer: null });
    const id = start.body.data.id;

    // Same game when asked again the same day.
    const again = await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({ mode: 'daily' });
    expect(again.body.data.id).toBe(id);

    const skipped = await request(app).post(`/api/songless/${id}/skip`).set('Cookie', adminCookie);
    expect(skipped.body.data).toMatchObject({ step: 1, unlocked_ms: STEPS_MS[1] });

    const dailyTrack = (await db.get<{ deezer_id: number }>(`SELECT t.deezer_id FROM daily_puzzles d JOIN tracks t ON t.id = d.track_id WHERE d.scope = 'global'`))!;
    const wrongId = [101, 102, 103, 104].find((x) => x !== dailyTrack.deezer_id)!;

    const wrong = await request(app).post(`/api/songless/${id}/guess`).set('Cookie', adminCookie).send({ deezer_id: wrongId });
    expect(wrong.body.data).toMatchObject({ step: 2, status: 'playing', answer: null });

    const right = await request(app).post(`/api/songless/${id}/guess`).set('Cookie', adminCookie)
      .send({ deezer_id: dailyTrack.deezer_id });
    expect(right.body.data).toMatchObject({ status: 'won', score: 5 });
    expect(right.body.data.answer.deezer_id).toBe(dailyTrack.deezer_id);

    const over = await request(app).post(`/api/songless/${id}/skip`).set('Cookie', adminCookie);
    expect(over.status).toBe(409);
  });

  it('does not let another user read or play my game', async () => {
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'dave', display_name: 'Dave' });
    const cookie = await login('dave', created.body.data.password);
    await request(app).post('/api/auth/password').set('Cookie', cookie)
      .send({ current: created.body.data.password, next: 'dave-new-password' });

    const mine = (await db.get<{ id: number }>(`SELECT id FROM songless_games WHERE mode = 'daily' LIMIT 1`))!;
    const res = await request(app).get(`/api/songless/${mine.id}`).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('ranks finished games on the daily leaderboard', async () => {
    const res = await request(app).get('/api/leaderboard/daily').set('Cookie', adminCookie);
    expect(res.body.data.rows).toEqual([expect.objectContaining({ display_name: 'Admin', score: 5, status: 'won' })]);
  });
});

describe('blind test', () => {
  const roundsOf = async (id: number) => JSON.parse(
    (await db.get<{ rounds: string }>('SELECT rounds FROM blindtests WHERE id = ?', [id]))!.rounds,
  ) as { track_id: number; choices: number[] }[];
  const deezerIdOf = async (trackId: number) =>
    (await db.get<{ deezer_id: number }>('SELECT deezer_id FROM tracks WHERE id = ?', [trackId]))!.deezer_id;

  it('plays a multiple-choice run to the end', async () => {
    const start = await request(app).post('/api/blindtest/start').set('Cookie', adminCookie)
      .send({ rounds: 3, answer_mode: 'mcq' });
    expect(start.status).toBe(200);
    const id = start.body.data.id;
    expect(start.body.data.round.choices).toHaveLength(4);
    expect(start.body.data.history).toEqual([]);

    // Round 1: right answer.
    const r0 = (await roundsOf(id))[0];
    const right = await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie)
      .send({ choice: r0.choices.indexOf(r0.track_id) });
    expect(right.body.data.history[0]).toMatchObject({ kind: 'right' });
    expect(right.body.data.score).toBeGreaterThanOrEqual(500);

    const again = await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie).send({ choice: 0 });
    expect(again.status).toBe(409);

    await request(app).post(`/api/blindtest/${id}/next`).set('Cookie', adminCookie);

    // Round 2: no answer in time.
    const timeout = await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie).send({ give_up: true });
    expect(timeout.body.data.history[1]).toMatchObject({ kind: 'timeout', points: 0 });
    await request(app).post(`/api/blindtest/${id}/next`).set('Cookie', adminCookie);

    // Round 3: wrong answer, then the run is over.
    const r2 = (await roundsOf(id))[2];
    const wrongChoice = r2.choices.findIndex((c) => c !== r2.track_id);
    await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie).send({ choice: wrongChoice });
    const end = await request(app).post(`/api/blindtest/${id}/next`).set('Cookie', adminCookie);
    expect(end.body.data).toMatchObject({ status: 'finished', round: null });
    expect(end.body.data.history).toHaveLength(3);
  });

  it('gives partial credit for the right artist in typed mode', async () => {
    const start = await request(app).post('/api/blindtest/start').set('Cookie', adminCookie)
      .send({ rounds: 4, answer_mode: 'type' });
    const id = start.body.data.id;
    const rounds = await roundsOf(id);
    // Find a Daft Punk round and answer the other Daft Punk song.
    const deezerIds = await Promise.all(rounds.map((r) => deezerIdOf(r.track_id)));
    const index = deezerIds.findIndex((d) => [103, 104].includes(d));
    for (let i = 0; i < index; i++) {
      await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie).send({ give_up: true });
      await request(app).post(`/api/blindtest/${id}/next`).set('Cookie', adminCookie);
    }
    const answerDeezer = deezerIds[index];
    const res = await request(app).post(`/api/blindtest/${id}/answer`).set('Cookie', adminCookie)
      .send({ deezer_id: answerDeezer === 103 ? 104 : 103 });
    expect(res.body.data.history[index]).toMatchObject({ kind: 'artist' });
    expect(res.body.data.history[index].points).toBeGreaterThan(0);
  });

  it('refuses a run longer than the playlist', async () => {
    const res = await request(app).post('/api/blindtest/start').set('Cookie', adminCookie).send({ rounds: 20 });
    expect(res.status).toBe(409);
  });
});

describe('shared playlists', () => {
  it('lets only the owner or an admin remove a playlist', async () => {
    const source = (await db.get<{ id: number }>(`INSERT INTO sources (kind, ref, name, owner_id) VALUES ('deezer_playlist', '999', 'Admin list', 1) RETURNING id`))!;
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'erin', display_name: 'Erin' });
    const cookie = await login('erin', created.body.data.password);
    await request(app).post('/api/auth/password').set('Cookie', cookie)
      .send({ current: created.body.data.password, next: 'erin-new-password' });

    const list = await request(app).get('/api/sources').set('Cookie', cookie);
    expect(list.body.data.find((s: { id: number }) => s.id === source.id)).toMatchObject({ mine: false });

    const forbidden = await request(app).delete(`/api/sources/${source.id}`).set('Cookie', cookie);
    expect(forbidden.status).toBe(403);
    const allowed = await request(app).delete(`/api/sources/${source.id}`).set('Cookie', adminCookie);
    expect(allowed.status).toBe(200);
  });
});
