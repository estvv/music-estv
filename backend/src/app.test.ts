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
let sourceId: number;

beforeAll(async () => {
  await db.run('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, true)',
    ['admin', 'Admin', await hashPassword('temporary-pass')]);

  // A small pool, inserted straight into the cache so no Deezer call is needed
  // except for the audio (not exercised here).
  const source = (await db.get<{ id: number }>(`INSERT INTO sources (kind, ref, name) VALUES ('deezer_playlist', '1', 'Test') RETURNING id`))!;
  sourceId = source.id;
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

  it('logs in, and changes the password with the current one', async () => {
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

  it('never lets an API answer be cached, generated passwords included', async () => {
    const res = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'cachecheck', display_name: 'Cache' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    const list = await request(app).get('/api/admin/users').set('Cookie', adminCookie);
    expect(JSON.stringify(list.body)).not.toMatch(/password_hash|scrypt\$/);
  });

  it('locks a new account until it replaces its generated password', async () => {
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'newbie', display_name: 'Newbie' });
    const cookie = await login('newbie', created.body.data.password);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.data).toMatchObject({ must_change_password: true });
    const blocked = await request(app).get('/api/sources').set('Cookie', cookie);
    expect(blocked.status).toBe(403);

    const changed = await request(app).post('/api/auth/password').set('Cookie', cookie)
      .send({ current: created.body.data.password, next: 'newbie-own-password' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/api/sources').set('Cookie', cookie)).status).toBe(200);

    // An admin reset puts the lock back.
    const reset = await request(app).patch(`/api/admin/users/${created.body.data.user.id}`).set('Cookie', adminCookie)
      .send({ reset_password: true });
    const again = await login('newbie', reset.body.data.password);
    expect((await request(app).get('/api/sources').set('Cookie', again)).status).toBe(403);
  });

  it('lets an admin rename any account, their own included', async () => {
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'renameme', display_name: 'Avant' });
    const id = created.body.data.user.id;

    const renamed = await request(app).patch(`/api/admin/users/${id}`).set('Cookie', adminCookie)
      .send({ username: 'renamed', display_name: 'Après' });
    expect(renamed.status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ username: 'RENAMED', password: created.body.data.password });
    expect(login.status).toBe(200);

    const taken = await request(app).patch(`/api/admin/users/${id}`).set('Cookie', adminCookie).send({ username: 'Admin' });
    expect(taken.status).toBe(409);
    const bad = await request(app).patch(`/api/admin/users/${id}`).set('Cookie', adminCookie).send({ username: 'pas valide!' });
    expect(bad.status).toBe(400);

    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    const self = await request(app).patch(`/api/admin/users/${me.body.data.id}`).set('Cookie', adminCookie)
      .send({ display_name: 'Le Boss' });
    expect(self.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', adminCookie)).body.data.display_name).toBe('Le Boss');
    await request(app).patch(`/api/admin/users/${me.body.data.id}`).set('Cookie', adminCookie).send({ display_name: 'Admin' });
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

describe('songless', () => {
  it('needs a playlist to start', async () => {
    const res = await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({});
    expect(res.status).toBe(400);
  });

  it('hides the answer while playing, then wins after a skip', async () => {
    const start = await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({ source_id: sourceId });
    expect(start.status).toBe(200);
    expect(start.body.data).toMatchObject({ status: 'playing', step: 0, unlocked_ms: STEPS_MS[0], answer: null, source_id: sourceId });
    const id = start.body.data.id;

    const skipped = await request(app).post(`/api/songless/${id}/skip`).set('Cookie', adminCookie);
    expect(skipped.body.data).toMatchObject({ step: 1, unlocked_ms: STEPS_MS[1] });

    const answer = (await db.get<{ deezer_id: number }>(`SELECT t.deezer_id FROM songless_games g JOIN tracks t ON t.id = g.track_id WHERE g.id = ?`, [id]))!;
    const wrongId = [101, 102, 103, 104].find((x) => x !== answer.deezer_id)!;

    const wrong = await request(app).post(`/api/songless/${id}/guess`).set('Cookie', adminCookie).send({ deezer_id: wrongId });
    expect(wrong.body.data).toMatchObject({ step: 2, status: 'playing', answer: null });

    const right = await request(app).post(`/api/songless/${id}/guess`).set('Cookie', adminCookie)
      .send({ deezer_id: answer.deezer_id });
    expect(right.body.data).toMatchObject({ status: 'won', score: 2 });
    expect(right.body.data.answer.deezer_id).toBe(answer.deezer_id);

    const over = await request(app).post(`/api/songless/${id}/skip`).set('Cookie', adminCookie);
    expect(over.status).toBe(409);
  });

  it('lets the player give up, and has no hints any more', async () => {
    const start = await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({ source_id: sourceId });
    const id = start.body.data.id;
    expect(start.body.data.steps_ms).toEqual([500, 2000, 5000, 10000]);
    expect(start.body.data).not.toHaveProperty('hints_left');
    expect((await request(app).post(`/api/songless/${id}/hint`).set('Cookie', adminCookie)).status).toBe(404);

    const gaveUp = await request(app).post(`/api/songless/${id}/give-up`).set('Cookie', adminCookie);
    expect(gaveUp.body.data).toMatchObject({ status: 'lost', score: 0 });
    expect(gaveUp.body.data.answer).not.toBeNull();
  });

  it('does not let another user read or play my game', async () => {
    const created = await request(app).post('/api/admin/users').set('Cookie', adminCookie)
      .send({ username: 'dave', display_name: 'Dave' });
    const cookie = await login('dave', created.body.data.password);
    await request(app).post('/api/auth/password').set('Cookie', cookie)
      .send({ current: created.body.data.password, next: 'dave-new-password' });

    const mine = (await db.get<{ id: number }>(`SELECT id FROM songless_games LIMIT 1`))!;
    const res = await request(app).get(`/api/songless/${mine.id}`).set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('ranks players per game and period', async () => {
    const res = await request(app).get('/api/leaderboard?game=songless&period=week').set('Cookie', adminCookie);
    // Two finished games: one won for 2 points (3rd attempt), one given up.
    expect(res.body.data.rows).toEqual([expect.objectContaining({
      display_name: 'Admin', points: 2, played: 2, won: 1, avg_attempts: 3,
    })]);
    const bad = await request(app).get('/api/leaderboard?game=chess').set('Cookie', adminCookie);
    expect(bad.status).toBe(400);
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
      .send({ source_id: sourceId, rounds: 3, answer_mode: 'mcq' });
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
      .send({ source_id: sourceId, rounds: 4, answer_mode: 'type' });
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
    const res = await request(app).post('/api/blindtest/start').set('Cookie', adminCookie).send({ source_id: sourceId, rounds: 20 });
    expect(res.status).toBe(409);
  });
});

describe('blind test leaderboard', () => {
  it('totals finished runs with a per-track average', async () => {
    const res = await request(app).get('/api/leaderboard?game=blindtest').set('Cookie', adminCookie);
    const admin = res.body.data.rows.find((r: { display_name: string }) => r.display_name === 'Admin');
    expect(admin).toMatchObject({ played: 1, tracks: 3 });
    expect(admin.per_track).toBe(Math.round(admin.points / 3));
    expect(admin.found).toBeGreaterThanOrEqual(1);
  });
});

describe('history', () => {
  it('lists finished Songless and blind tests, newest first', async () => {
    const res = await request(app).get('/api/history').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const games = res.body.data.recent.map((r: { game: string }) => r.game);
    expect(games).toContain('songless');
    expect(games).toContain('blindtest');
    const times = res.body.data.recent.map((r: { finished_at: string }) => new Date(r.finished_at).getTime());
    expect(times).toEqual([...times].sort((x: number, y: number) => y - x));
    expect(res.body.data.recent[0]).toHaveProperty('source_name');
  });
});

describe('player profiles', () => {
  it('shows stats, records and a bio with a favourite song', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    const adminId = me.body.data.id;

    const saved = await request(app).patch('/api/auth/profile').set('Cookie', adminCookie)
      .send({ bio: 'Fan de Daft Punk', favorite_deezer_ids: [103, 101] });
    expect(saved.status).toBe(200);
    const tooLong = await request(app).patch('/api/auth/profile').set('Cookie', adminCookie).send({ bio: 'x'.repeat(281) });
    expect(tooLong.status).toBe(400);

    const profile = await request(app).get(`/api/players/${adminId}`).set('Cookie', adminCookie);
    expect(profile.body.data.player).toMatchObject({ display_name: 'Admin', bio: 'Fan de Daft Punk' });
    expect(profile.body.data.player.favorites.map((f: { title: string }) => f.title)).toEqual(['One More Time', 'Bohemian Rhapsody']);
    const six = await request(app).patch('/api/auth/profile').set('Cookie', adminCookie).send({ favorite_deezer_ids: [101, 102, 103, 104, 105, 106] });
    expect(six.status).toBe(400);
    const twice = await request(app).patch('/api/auth/profile').set('Cookie', adminCookie).send({ favorite_deezer_ids: [101, 101] });
    expect(twice.status).toBe(400);
    expect(profile.body.data.stats.songless).toMatchObject({ won: 1, lost: 1 });
    expect(profile.body.data.stats.songless.distribution).toHaveLength(4);
    expect(profile.body.data.stats.blindtest.played).toBe(1);
    expect(profile.body.data.recent.length).toBeGreaterThan(0);

    const curve = await request(app).get(`/api/players/${adminId}/progress?game=songless&period=week`).set('Cookie', adminCookie);
    expect(curve.body.data[0]).toMatchObject({ points: 2 });

    const recs = await request(app).get('/api/leaderboard/records?game=blindtest').set('Cookie', adminCookie);
    expect(recs.body.data.map((r: { key: string }) => r.key)).toEqual(expect.arrayContaining(['best_run', 'fastest']));

    expect((await request(app).get('/api/players/99999').set('Cookie', adminCookie)).status).toBe(404);

    // Profile URLs use the username, whatever its case.
    const byName = await request(app).get('/api/players/ADMIN').set('Cookie', adminCookie);
    expect(byName.body.data.player).toMatchObject({ id: adminId, username: 'admin' });
    const board = await request(app).get('/api/leaderboard?game=songless').set('Cookie', adminCookie);
    expect(board.body.data.rows[0]).toHaveProperty('username', 'admin');
    expect(recs.body.data[0]).toHaveProperty('username', 'admin');

    // "update" is the profile editor's path, so nobody can be called that.
    const reserved = await request(app).post('/api/admin/users').set('Cookie', adminCookie).send({ username: 'Update', display_name: 'X' });
    expect(reserved.status).toBe(400);
  });
});

describe('profile pictures', () => {
  it('stores an uploaded image, serves it, and falls back once removed', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    const fake = await request(app).put('/api/auth/avatar').set('Cookie', adminCookie)
      .set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>'));
    expect(fake.status).toBe(400);

    const up = await request(app).put('/api/auth/avatar').set('Cookie', adminCookie).set('Content-Type', 'image/png').send(png);
    expect(up.status).toBe(200);
    const url = up.body.data.avatar_url as string;
    expect(url).toMatch(/^\/api\/players\/\d+\/avatar\?v=\d+$/);

    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    expect(me.body.data).toMatchObject({ avatar_url: url, avatar_custom: true });
    const img = await request(app).get(url).set('Cookie', adminCookie);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    const board = await request(app).get('/api/leaderboard?game=songless').set('Cookie', adminCookie);
    expect(board.body.data.rows[0].avatar_url).toBe(url);

    const removed = await request(app).delete('/api/auth/avatar').set('Cookie', adminCookie);
    expect(removed.body.data.avatar_url).toBeNull();
    expect((await request(app).get(url).set('Cookie', adminCookie)).status).toBe(404);
  });
});

describe('deezer link', () => {
  it('refuses a non-Deezer link and uses the Deezer picture as a fallback', async () => {
    const bad = await request(app).post('/api/deezer/link').set('Cookie', adminCookie).send({ ref: 'https://evil.example/profile/1' });
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/deezer/playlists').set('Cookie', adminCookie)).status).toBe(409);

    const me = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    await db.run(`INSERT INTO deezer_links (user_id, deezer_user_id, name, image) VALUES (?, 5, 'Dan', 'https://cdn-images.dzcdn.net/x.jpg')`, [me.body.data.id]);
    const linked = await request(app).get('/api/auth/me').set('Cookie', adminCookie);
    expect(linked.body.data).toMatchObject({ deezer: { name: 'Dan' }, avatar_url: 'https://cdn-images.dzcdn.net/x.jpg' });

    await request(app).delete('/api/deezer/link').set('Cookie', adminCookie);
    expect((await request(app).get('/api/auth/me').set('Cookie', adminCookie)).body.data.deezer).toBeNull();
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

  it('keeps a private playlist to its owner, who alone can publish it', async () => {
    const erin = await login('erin', 'erin-new-password');
    const priv = (await db.get<{ id: number }>(
      `INSERT INTO sources (kind, ref, name, owner_id, is_public) VALUES ('deezer_playlist', '777', 'Secret', 1, false) RETURNING id`,
    ))!;
    await db.run('INSERT INTO source_tracks (source_id, track_id) SELECT ?, track_id FROM source_tracks WHERE source_id = ?', [priv.id, sourceId]);

    const theirs = await request(app).get('/api/sources').set('Cookie', erin);
    expect(theirs.body.data.some((s: { id: number }) => s.id === priv.id)).toBe(false);
    const mine = await request(app).get('/api/sources').set('Cookie', adminCookie);
    expect(mine.body.data.find((s: { id: number }) => s.id === priv.id)).toMatchObject({ is_public: false, mine: true });

    expect((await request(app).get(`/api/sources/${priv.id}/tracks`).set('Cookie', erin)).status).toBe(404);
    expect((await request(app).post('/api/songless/start').set('Cookie', erin).send({ source_id: priv.id })).status).toBe(404);
    expect((await request(app).post('/api/songless/start').set('Cookie', adminCookie).send({ source_id: priv.id })).status).toBe(200);

    expect((await request(app).patch(`/api/sources/${priv.id}`).set('Cookie', erin).send({ is_public: true })).status).toBe(403);
    expect((await request(app).patch(`/api/sources/${priv.id}`).set('Cookie', adminCookie).send({ is_public: true })).status).toBe(200);
    const now = await request(app).get('/api/sources').set('Cookie', erin);
    expect(now.body.data.some((s: { id: number }) => s.id === priv.id)).toBe(true);
  });
});
