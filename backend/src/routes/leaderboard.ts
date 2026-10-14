import { Router } from 'express';
import { db } from '../db/index.js';
import { route } from '../http.js';
import { MAX_STEPS, today } from '../services/songless.js';

const router = Router();

// Current and best run of consecutive days won, from a list of won days.
export function streaks(wonDays: string[], currentDay: string): { current: number; best: number } {
  const days = new Set(wonDays);
  const shift = (day: string, delta: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  let best = 0;
  for (const day of days) {
    if (days.has(shift(day, -1))) continue; // not the start of a run
    let length = 1;
    while (days.has(shift(day, length))) length += 1;
    best = Math.max(best, length);
  }

  // A streak survives until today's daily is lost or the day ends unplayed.
  let cursor = days.has(currentDay) ? currentDay : shift(currentDay, -1);
  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = shift(cursor, -1);
  }
  return { current, best };
}

router.get('/daily', route(async (req, res) => {
  const day = typeof req.query.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : today();
  // Only finished games are ranked; a game in progress would leak nothing but
  // still clutters the board.
  const rows = await db.all(`
    SELECT u.id AS user_id, u.display_name, g.status, g.score, g.step, g.finished_at
    FROM songless_games g JOIN users u ON u.id = g.user_id
    WHERE g.mode = 'daily' AND g.day = ? AND g.status != 'playing'
    ORDER BY g.score DESC, g.finished_at ASC
  `, [day]);
  res.json({ success: true, data: { day, rows } });
}));

router.get('/all', route(async (_req, res) => {
  const day = today();
  const users = await db.all<{ id: number; display_name: string }>('SELECT id, display_name FROM users WHERE NOT disabled');
  const totals = await db.all<{ user_id: number; daily_score: number; daily_played: number; daily_won: number; free_score: number; free_played: number }>(`
    SELECT user_id,
      SUM(CASE WHEN mode = 'daily' THEN score ELSE 0 END) AS daily_score,
      SUM(CASE WHEN mode = 'daily' AND status != 'playing' THEN 1 ELSE 0 END) AS daily_played,
      SUM(CASE WHEN mode = 'daily' AND status = 'won' THEN 1 ELSE 0 END) AS daily_won,
      SUM(CASE WHEN mode = 'free' THEN score ELSE 0 END) AS free_score,
      SUM(CASE WHEN mode = 'free' AND status != 'playing' THEN 1 ELSE 0 END) AS free_played
    FROM songless_games GROUP BY user_id
  `);
  const parties = await db.all<{ user_id: number; party_played: number; party_won: number }>(`
    SELECT user_id, COUNT(*) AS party_played, SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) AS party_won
    FROM party_results GROUP BY user_id
  `);
  const wonDays = await db.all<{ user_id: number; day: string }>(
    `SELECT user_id, day FROM songless_games WHERE mode = 'daily' AND status = 'won'`,
  );

  const rows = users.map((u) => {
    const t = totals.find((x) => x.user_id === u.id);
    const party = parties.find((x) => x.user_id === u.id);
    return {
      user_id: u.id,
      display_name: u.display_name,
      daily_score: t?.daily_score ?? 0,
      daily_played: t?.daily_played ?? 0,
      daily_won: t?.daily_won ?? 0,
      free_score: t?.free_score ?? 0,
      free_played: t?.free_played ?? 0,
      party_played: party?.party_played ?? 0,
      party_won: party?.party_won ?? 0,
      ...streaks(wonDays.filter((w) => w.user_id === u.id).map((w) => w.day), day),
    };
  }).filter((r) => r.daily_played + r.free_played + r.party_played > 0)
    .sort((a, b) => b.daily_score - a.daily_score || b.free_score - a.free_score);

  res.json({ success: true, data: rows });
}));

router.get('/me', route(async (req, res) => {
  const games = await db.all<{ day: string; status: string; step: number }>(`
    SELECT day, status, step FROM songless_games WHERE user_id = ? AND mode = 'daily' AND status != 'playing'
  `, [req.user!.id]);

  // Wordle-style distribution: wins per step, plus losses.
  const distribution = Array.from({ length: MAX_STEPS }, () => 0);
  let lost = 0;
  for (const g of games) {
    if (g.status === 'won') distribution[g.step] += 1;
    else lost += 1;
  }

  res.json({
    success: true,
    data: {
      played: games.length,
      won: games.length - lost,
      lost,
      distribution,
      ...streaks(games.filter((g) => g.status === 'won').map((g) => g.day), today()),
    },
  });
}));

export default router;
