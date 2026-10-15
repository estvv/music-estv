import { Router } from 'express';
import { db } from '../db/index.js';
import { route } from '../http.js';
import { recentGames } from '../services/stats.js';

const router = Router();

// The home page's "recent games": finished Songless and blind tests mixed, most
// recent first, plus the Songless game still in progress (to resume it).
router.get('/', route(async (req, res) => {
  const userId = req.user!.id;
  const [recent, playing] = await Promise.all([
    recentGames(userId, userId),
    // Only a real Songless on a playlist that still exists, started this week:
    // unfinished games of the retired daily modes are not worth resuming.
    db.get<{ id: number; step: number; source_name: string }>(`
      SELECT g.id, g.step, s.name AS source_name
      FROM songless_games g JOIN sources s ON s.id = g.source_id
      WHERE g.user_id = ? AND g.status = 'playing' AND g.mode = 'free'
        AND g.created_at > now() - interval '7 days'
      ORDER BY g.id DESC LIMIT 1
    `, [userId]),
  ]);

  res.json({ success: true, data: { recent, playing: playing ?? null } });
}));

export default router;
