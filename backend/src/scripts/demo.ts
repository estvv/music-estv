// Fake players with a believable history, to preview the leaderboard and the
// profiles locally. Development only.
//   npm run db:demo            (re)creates the demo players and their games
//   npm run db:demo -- --clean removes them
// Demo accounts are named demo_<name> and cannot log in (random password).
// Deleting them cascades to all of their games.
import { generatePassword, hashPassword } from '../auth/crypto.js';
import { closeDatabase, db, initDatabase } from '../db/index.js';
import { pointsFor } from '../services/blindtest.js';
import { MAX_STEPS } from '../services/songless.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to add demo players to a production database.');
  process.exit(1);
}

const DAYS = 45;
// skill: chance to find a song (Songless) or answer right (blind test);
// activity: games per week.
const PLAYERS = [
  { name: 'Léa', skill: 0.85, activity: 9, bio: 'Rap FR et R&B. Imbattable sur les intros.' },
  { name: 'Tom', skill: 0.7, activity: 6, bio: 'Plutôt rock, mais je ne dis jamais non à un blind test.' },
  { name: 'Inès', skill: 0.78, activity: 4, bio: null },
  { name: 'Max', skill: 0.55, activity: 8, bio: 'Je joue beaucoup, je trouve parfois.' },
  { name: 'Sarah', skill: 0.65, activity: 3, bio: 'Team pop des années 2010.' },
  { name: 'Yanis', skill: 0.9, activity: 2, bio: null },
  { name: 'Chloé', skill: 0.45, activity: 5, bio: 'Ici pour les soirées 🎉' },
  { name: 'Hugo', skill: 0.6, activity: 1, bio: null },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000 - rand(0, 10) * 3_600_000);

async function clean() {
  const { count } = (await db.get<{ count: number }>(
    "WITH gone AS (DELETE FROM users WHERE username LIKE 'demo\\_%' RETURNING 1) SELECT COUNT(*) AS count FROM gone",
  ))!;
  console.log(`Removed ${count} demo player(s).`);
}

async function main() {
  await initDatabase();
  await clean();
  if (process.argv.includes('--clean')) return;

  const sources = await db.all<{ id: number; tracks: number[] }>(`
    SELECT s.id, array_agg(st.track_id) AS tracks FROM sources s
    JOIN source_tracks st ON st.source_id = s.id WHERE s.is_public GROUP BY s.id
  `);
  if (sources.length === 0) {
    console.error('No public playlist with tracks: import one first (npm run db:fixtures).');
    return;
  }

  const ids: number[] = [];
  for (const p of PLAYERS) {
    const username = `demo_${p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`;
    const user = (await db.get<{ id: number }>(`
      INSERT INTO users (username, display_name, password_hash, bio, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id
    `, [username, p.name, await hashPassword(generatePassword()), p.bio, daysAgo(DAYS + rand(0, 60))]))!;
    ids.push(user.id);

    const games = Math.round((p.activity * DAYS) / 7);
    for (let g = 0; g < games; g++) {
      const source = pick(sources);
      const at = daysAgo(rand(0, DAYS));
      if (Math.random() < 0.6) await songless(user.id, source, p.skill, at);
      else await blindtest(user.id, source, p.skill, at);
    }

    // 1 to 5 distinct favourites.
    const favorites = [...new Set(Array.from({ length: Math.ceil(rand(0, 5)) }, () => pick(pick(sources).tracks)))];
    for (const [position, trackId] of favorites.entries()) {
      await db.run('INSERT INTO user_favorites (user_id, position, track_id) VALUES (?, ?, ?)', [user.id, position, trackId]);
    }
  }

  await parties(ids);
  console.log(`Added ${PLAYERS.length} demo players. Remove them with: npm run db:demo -- --clean`);
}

// Each failed attempt is a wrong guess or a skip; a better player finds sooner.
async function songless(userId: number, source: { id: number; tracks: number[] }, skill: number, at: Date) {
  const trackId = pick(source.tracks);
  let step = 0;
  while (step < MAX_STEPS && Math.random() > skill * (0.3 + step * 0.15)) step += 1;
  const won = step < MAX_STEPS;
  const guesses = Array.from({ length: Math.min(step, MAX_STEPS) }, () => (Math.random() < 0.4 ? { kind: 'skip' } : {
    kind: 'wrong', title: 'Mauvaise réponse', artist: 'Quelqu\'un',
  }));
  const track = (await db.get<{ title: string; artist: string }>('SELECT title, artist FROM tracks WHERE id = ?', [trackId]))!;
  if (won) guesses.push({ kind: 'right', title: track.title, artist: track.artist });
  await db.run(`
    INSERT INTO songless_games (user_id, mode, track_id, source_id, step, guesses, status, score, created_at, finished_at)
    VALUES (?, 'free', ?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, trackId, source.id, won ? step : MAX_STEPS - 1, JSON.stringify(guesses), won ? 'won' : 'lost', won ? MAX_STEPS - step : 0, at, at]);
}

async function blindtest(userId: number, source: { id: number; tracks: number[] }, skill: number, at: Date) {
  const total = pick([5, 10, 10, 20]);
  let score = 0;
  const rounds = Array.from({ length: total }, () => {
    const r = Math.random();
    const kind = r < skill * 0.85 ? 'right' : r < skill * 0.9 ? 'artist' : r < 0.93 ? 'wrong' : 'timeout';
    const elapsed = Math.round(kind === 'timeout' ? 15000 : rand(1200, 13000) * (1.3 - skill));
    const points = pointsFor(kind, elapsed);
    score += points;
    return { track_id: pick(source.tracks), choices: null, started_at: null, result: { kind, points, elapsed_ms: elapsed, guess: null } };
  });
  await db.run(`
    INSERT INTO blindtests (user_id, source_id, answer_mode, rounds, current, score, status, created_at, finished_at)
    VALUES (?, ?, 'mcq', ?, ?, ?, 'finished', ?, ?)
  `, [userId, source.id, JSON.stringify(rounds), total - 1, score, at, at]);
}

// A dozen evenings of 3 to 6 players; the better ones tend to win.
async function parties(ids: number[]) {
  for (let i = 0; i < 12; i++) {
    const at = daysAgo(rand(0, DAYS));
    const players = [...ids].sort(() => Math.random() - 0.5).slice(0, Math.round(rand(3, 6)));
    const scored = players.map((id) => ({ id, score: Math.round(PLAYERS[ids.indexOf(id)].skill * rand(3000, 9000)) }))
      .sort((a, b) => b.score - a.score);
    const code = `DEMO${i}`;
    for (const [rank, p] of scored.entries()) {
      await db.run(`
        INSERT INTO party_results (user_id, room_code, game, score, rank, players, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [p.id, code, pick(['blindtest', 'songless', 'wholiked']), p.score, rank + 1, scored.length, at]);
    }
  }
}

await main();
await closeDatabase();
