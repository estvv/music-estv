import { db } from '../db/index.js';
import { MAX_STEPS } from './songless.js';
import { AVATAR_URL_SQL } from './avatars.js';

// Statistics behind the leaderboard, the records and the player profiles.

export type Game = 'songless' | 'blindtest' | 'party';
export type Period = 'week' | 'month' | 'all';

// Literal SQL fragments only, never user input.
export const SINCE: Record<Period, string> = {
  week: "now() - interval '7 days'",
  month: "now() - interval '30 days'",
  all: "'-infinity'::timestamptz",
};

// --- per-player stats ---------------------------------------------------------

export async function songlessStats(userId: number, period: Period) {
  const games = await db.all<{ status: 'won' | 'lost'; step: number; score: number }>(`
    SELECT status, step, score FROM songless_games
    WHERE user_id = ? AND status != 'playing' AND finished_at >= ${SINCE[period]}
    ORDER BY finished_at
  `, [userId]);
  const won = games.filter((g) => g.status === 'won');
  // Wordle-style: wins per attempt (1 to 7), then losses.
  const distribution = Array.from({ length: MAX_STEPS }, (_, i) => won.filter((g) => g.step === i).length);
  return {
    points: games.reduce((n, g) => n + g.score, 0),
    played: games.length,
    won: won.length,
    lost: games.length - won.length,
    first_try: distribution[0],
    avg_attempts: won.length ? Math.round((won.reduce((n, g) => n + g.step + 1, 0) / won.length) * 10) / 10 : null,
    distribution,
    best_streak: longestRun(games.map((g) => g.status === 'won')),
  };
}

export async function blindtestStats(userId: number, period: Period) {
  const runs = await db.all<{ score: number; rounds: string }>(`
    SELECT score, rounds FROM blindtests
    WHERE user_id = ? AND status = 'finished' AND finished_at >= ${SINCE[period]}
    ORDER BY finished_at
  `, [userId]);
  const results = runs.flatMap((r) => (JSON.parse(r.rounds) as { result: { kind: string; elapsed_ms: number } | null }[])
    .map((round) => round.result));
  const right = results.filter((r) => r?.kind === 'right');
  const points = runs.reduce((n, r) => n + r.score, 0);
  return {
    points,
    played: runs.length,
    best: runs.reduce((n, r) => Math.max(n, r.score), 0),
    found: right.length,
    tracks: results.length,
    per_track: results.length ? Math.round(points / results.length) : null,
    fastest_ms: right.length ? Math.min(...right.map((r) => r!.elapsed_ms)) : null,
    best_streak: longestRun(results.map((r) => r?.kind === 'right')),
  };
}

export async function partyStats(userId: number, period: Period) {
  const row = await db.get<{ played: number; wins: number; podiums: number; points: number }>(`
    SELECT COUNT(*) AS played,
      COUNT(*) FILTER (WHERE rank = 1) AS wins,
      COUNT(*) FILTER (WHERE rank <= 3) AS podiums,
      COALESCE(SUM(score), 0)::int AS points
    FROM party_results WHERE user_id = ? AND played_at >= ${SINCE[period]}
  `, [userId]);
  return row!;
}

export function longestRun(flags: boolean[]): number {
  let best = 0;
  let current = 0;
  for (const ok of flags) {
    current = ok ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

// Points per day over the period (days without games are filled by the client).
export async function progress(userId: number, game: Game, period: Period) {
  const sql = {
    songless: `SELECT finished_at::date AS day, SUM(score)::int AS points FROM songless_games
      WHERE user_id = ? AND status != 'playing' AND finished_at >= ${SINCE[period]} GROUP BY 1 ORDER BY 1`,
    blindtest: `SELECT finished_at::date AS day, SUM(score)::int AS points FROM blindtests
      WHERE user_id = ? AND status = 'finished' AND finished_at >= ${SINCE[period]} GROUP BY 1 ORDER BY 1`,
    party: `SELECT played_at::date AS day, SUM(score)::int AS points FROM party_results
      WHERE user_id = ? AND played_at >= ${SINCE[period]} GROUP BY 1 ORDER BY 1`,
  }[game];
  return db.all<{ day: string; points: number }>(sql, [userId]);
}

// --- records ---------------------------------------------------------------------

export interface RecordEntry {
  key: string;
  label: string;
  value: string;
  user_id: number;
  username?: string;
  avatar_url?: string | null;
  display_name: string;
  detail: string | null;
}

export async function records(game: Game, period: Period): Promise<RecordEntry[]> {
  const since = SINCE[period];
  const out: RecordEntry[] = [];

  if (game === 'songless') {
    const first = await db.get<{ user_id: number; display_name: string; n: number }>(`
      SELECT u.id AS user_id, u.display_name, COUNT(*) AS n
      FROM songless_games g JOIN users u ON u.id = g.user_id
      WHERE g.status = 'won' AND g.step = 0 AND g.finished_at >= ${since} AND NOT u.disabled
      GROUP BY u.id ORDER BY n DESC, MIN(g.finished_at) LIMIT 1
    `);
    if (first) {
      out.push({ key: 'first_try', label: 'Trouvés au 1er essai', value: String(first.n), user_id: first.user_id, display_name: first.display_name, detail: 'dès 1 s' });
    }
    const games = await db.all<{ user_id: number; display_name: string; won: boolean }>(`
      SELECT u.id AS user_id, u.display_name, g.status = 'won' AS won
      FROM songless_games g JOIN users u ON u.id = g.user_id
      WHERE g.status != 'playing' AND g.finished_at >= ${since} AND NOT u.disabled
      ORDER BY g.user_id, g.finished_at
    `);
    const streak = bestStreak(games.map((g) => ({ ...g, ok: g.won })));
    if (streak) out.push({ key: 'streak', label: 'Plus longue série', value: String(streak.n), ...streak.who, detail: 'Songless trouvés d\'affilée' });
  }

  if (game === 'blindtest') {
    const runs = await db.all<{ id: number; user_id: number; display_name: string; score: number; rounds: string }>(`
      SELECT b.id, u.id AS user_id, u.display_name, b.score, b.rounds
      FROM blindtests b JOIN users u ON u.id = b.user_id
      WHERE b.status = 'finished' AND b.finished_at >= ${since} AND NOT u.disabled
      ORDER BY b.user_id, b.finished_at
    `);
    const best = [...runs].sort((a, b) => b.score - a.score)[0];
    if (best) {
      const total = (JSON.parse(best.rounds) as unknown[]).length;
      out.push({ key: 'best_run', label: 'Meilleure partie', value: `${best.score} pts`, user_id: best.user_id, display_name: best.display_name, detail: `sur ${total} morceaux` });
    }

    type Round = { track_id: number; result: { kind: string; elapsed_ms: number } | null };
    let fastest: { ms: number; trackId: number; user_id: number; display_name: string } | null = null;
    const flags: { user_id: number; display_name: string; ok: boolean }[] = [];
    for (const run of runs) {
      for (const round of JSON.parse(run.rounds) as Round[]) {
        const ok = round.result?.kind === 'right';
        flags.push({ user_id: run.user_id, display_name: run.display_name, ok });
        if (ok && (!fastest || round.result!.elapsed_ms < fastest.ms)) {
          fastest = { ms: round.result!.elapsed_ms, trackId: round.track_id, user_id: run.user_id, display_name: run.display_name };
        }
      }
    }
    if (fastest) {
      const track = await db.get<{ title: string; artist: string }>('SELECT title, artist FROM tracks WHERE id = ?', [fastest.trackId]);
      out.push({
        key: 'fastest', label: 'Réflexe le plus rapide', value: `${(fastest.ms / 1000).toFixed(1)} s`,
        user_id: fastest.user_id, display_name: fastest.display_name, detail: track ? `${track.title} — ${track.artist}` : null,
      });
    }
    const streak = bestStreak(flags);
    if (streak) out.push({ key: 'streak', label: 'Plus longue série', value: String(streak.n), ...streak.who, detail: 'bonnes réponses d\'affilée' });
  }

  // Username (profile link) and picture of each record holder.
  const holders = await db.all<{ id: number; username: string; avatar_url: string | null }>(`
    SELECT u.id, u.username, ${AVATAR_URL_SQL} AS avatar_url
    FROM users u LEFT JOIN spotify_links sl ON sl.user_id = u.id WHERE u.id = ANY(?)
  `, [out.map((r) => r.user_id)]);
  return out.map((r) => {
    const h = holders.find((x) => x.id === r.user_id);
    return { ...r, username: h?.username, avatar_url: h?.avatar_url ?? null };
  });
}

// Longest run of `ok` per user (rows grouped by user, in play order).
function bestStreak(rows: { user_id: number; display_name: string; ok: boolean }[]) {
  let best: { n: number; who: { user_id: number; display_name: string } } | null = null;
  let current = 0;
  let previous: number | null = null;
  for (const row of rows) {
    if (row.user_id !== previous) current = 0;
    previous = row.user_id;
    current = row.ok ? current + 1 : 0;
    if (current > 0 && (!best || current > best.n)) best = { n: current, who: { user_id: row.user_id, display_name: row.display_name } };
  }
  return best;
}

// --- recent games ----------------------------------------------------------------

// A player's last finished games. The playlist name of a private playlist is
// only shown to its owner.
export async function recentGames(userId: number, viewerId: number, limit = 10) {
  const [songless, blindtests] = await Promise.all([
    db.all<{
      id: number; status: 'won' | 'lost'; step: number; score: number; finished_at: string;
      title: string; artist: string; cover_url: string | null; source_name: string | null;
    }>(`
      SELECT g.id, g.status, g.step, g.score, g.finished_at, t.title, t.artist, t.cover_url,
        CASE WHEN s.is_public OR s.owner_id = ? THEN s.name END AS source_name
      FROM songless_games g
      JOIN tracks t ON t.id = g.track_id
      LEFT JOIN sources s ON s.id = g.source_id
      WHERE g.user_id = ? AND g.status != 'playing'
      ORDER BY g.finished_at DESC LIMIT ?
    `, [viewerId, userId, limit]),
    db.all<{ id: number; score: number; total: number; finished_at: string; source_name: string | null }>(`
      SELECT b.id, b.score, jsonb_array_length(b.rounds::jsonb) AS total, b.finished_at,
        CASE WHEN s.is_public OR s.owner_id = ? THEN s.name END AS source_name
      FROM blindtests b LEFT JOIN sources s ON s.id = b.source_id
      WHERE b.user_id = ? AND b.status = 'finished'
      ORDER BY b.finished_at DESC LIMIT ?
    `, [viewerId, userId, limit]),
  ]);
  return [
    ...songless.map((g) => ({ game: 'songless' as const, ...g })),
    ...blindtests.map((b) => ({ game: 'blindtest' as const, ...b })),
  ].sort((a, b) => new Date(b.finished_at).getTime() - new Date(a.finished_at).getTime()).slice(0, limit);
}
