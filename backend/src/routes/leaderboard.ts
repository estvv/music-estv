import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { route } from '../http.js';
import { records, SINCE } from '../services/stats.js';
import { AVATAR_URL_SQL } from '../services/avatars.js';

const router = Router();

// One board per game, over a period, already in ranking order. Every row
// carries its game's stats for the table.
const query = z.object({
  game: z.enum(['songless', 'blindtest', 'party']).default('songless'),
  period: z.enum(['week', 'month', 'all']).default('all'),
});

// Songless: 4 points for a song found on the first clip, down to 1 on the last.
function songless(since: string) {
  return db.all(`
    SELECT u.id AS user_id, u.username, u.display_name, ${AVATAR_URL_SQL} AS avatar_url,
      SUM(g.score)::int AS points,
      COUNT(*) AS played,
      COUNT(*) FILTER (WHERE g.status = 'won') AS won,
      COUNT(*) FILTER (WHERE g.status = 'won' AND g.step = 0) AS first_try,
      ROUND(AVG(g.step + 1) FILTER (WHERE g.status = 'won'), 1)::float AS avg_attempts
    FROM songless_games g JOIN users u ON u.id = g.user_id
    LEFT JOIN spotify_links sl ON sl.user_id = u.id
    WHERE g.status != 'playing' AND g.finished_at >= ${since} AND NOT u.disabled
    GROUP BY u.id, sl.user_id
    ORDER BY points DESC, won DESC, u.display_name
  `);
}

// Blind test: totals over finished runs, plus a per-track average that does
// not favour long runs.
function blindtest(since: string) {
  return db.all(`
    WITH runs AS (
      SELECT b.user_id, b.score,
        jsonb_array_length(b.rounds::jsonb) AS tracks,
        (SELECT COUNT(*) FROM jsonb_array_elements(b.rounds::jsonb) r WHERE r->'result'->>'kind' = 'right') AS found
      FROM blindtests b
      WHERE b.status = 'finished' AND b.finished_at >= ${since}
    )
    SELECT u.id AS user_id, u.username, u.display_name, ${AVATAR_URL_SQL} AS avatar_url,
      SUM(r.score)::int AS points,
      COUNT(*) AS played,
      MAX(r.score) AS best,
      SUM(r.found)::int AS found,
      SUM(r.tracks)::int AS tracks,
      ROUND(SUM(r.score)::numeric / NULLIF(SUM(r.tracks), 0))::int AS per_track
    FROM runs r JOIN users u ON u.id = r.user_id
    LEFT JOIN spotify_links sl ON sl.user_id = u.id
    WHERE NOT u.disabled
    GROUP BY u.id, sl.user_id
    ORDER BY points DESC, best DESC, u.display_name
  `);
}

// Party rooms: wins first, then podiums, then points scored.
function party(since: string) {
  return db.all(`
    SELECT u.id AS user_id, u.username, u.display_name, ${AVATAR_URL_SQL} AS avatar_url,
      COUNT(*) FILTER (WHERE p.rank = 1) AS wins,
      COUNT(*) FILTER (WHERE p.rank <= 3) AS podiums,
      COUNT(*) AS played,
      SUM(p.score)::int AS points
    FROM party_results p JOIN users u ON u.id = p.user_id
    LEFT JOIN spotify_links sl ON sl.user_id = u.id
    WHERE p.played_at >= ${since} AND NOT u.disabled
    GROUP BY u.id, sl.user_id
    ORDER BY wins DESC, podiums DESC, points DESC, u.display_name
  `);
}

router.get('/', route(async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const { game, period } = parsed.data;
  const since = SINCE[period];
  const rows = game === 'songless' ? await songless(since) : game === 'blindtest' ? await blindtest(since) : await party(since);
  res.json({ success: true, data: { game, period, rows } });
}));

router.get('/records', route(async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  res.json({ success: true, data: await records(parsed.data.game, parsed.data.period) });
}));

export default router;
