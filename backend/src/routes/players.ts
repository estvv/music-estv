import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { parseId, route } from '../http.js';
import { AVATAR_URL_SQL, getAvatar } from '../services/avatars.js';
import { blindtestStats, partyStats, progress, recentGames, songlessStats } from '../services/stats.js';

// Player profiles: visible to every account (the site is among friends).
const router = Router();

const periodQuery = z.object({ period: z.enum(['week', 'month', 'all']).default('all') });

// A player is designated by their username (profile URLs), or by their numeric
// id (older links).
router.get('/:ref', route(async (req, res) => {
  const ref = req.params.ref;
  const parsed = periodQuery.safeParse(req.query);
  if (!parsed.success || ref.length > 64) return res.status(400).json({ success: false, error: 'Invalid request' });
  const byId = /^\d+$/.test(ref);
  const player = await db.get<{
    id: number; username: string; display_name: string; bio: string | null; created_at: string; avatar_url: string | null;
  }>(`
    SELECT u.id, u.username, u.display_name, u.bio, u.created_at, ${AVATAR_URL_SQL} AS avatar_url
    FROM users u LEFT JOIN spotify_links sl ON sl.user_id = u.id
    WHERE ${byId ? 'u.id = ?' : 'lower(u.username) = lower(?)'} AND NOT u.disabled
  `, [byId ? Number(ref) : ref]);
  if (!player) return res.status(404).json({ success: false, error: 'Player not found' });

  const { period } = parsed.data;
  const [songless, blindtest, party, recent, favorites] = await Promise.all([
    songlessStats(player.id, period), blindtestStats(player.id, period), partyStats(player.id, period), recentGames(player.id, req.user!.id),
    db.all<{ deezer_id: number; title: string; artist: string; cover_url: string | null; spotify_id: string | null }>(`
      SELECT t.deezer_id, t.title, t.artist, t.cover_url, t.spotify_id
      FROM user_favorites f JOIN tracks t ON t.id = f.track_id
      WHERE f.user_id = ? ORDER BY f.position
    `, [player.id]),
  ]);
  res.json({
    success: true,
    data: {
      player: {
        id: player.id,
        username: player.username,
        display_name: player.display_name,
        avatar_url: player.avatar_url,
        bio: player.bio,
        created_at: player.created_at,
        favorites,
      },
      stats: { songless, blindtest, party },
      recent,
    },
  });
}));

// Uploaded pictures only (Spotify ones are linked directly). The URL carries a
// version, so the image can be cached for good.
router.get('/:id/avatar', route(async (req, res) => {
  const image = await getAvatar(parseId(req.params.id));
  if (!image) return res.status(404).json({ success: false, error: 'No picture' });
  res.set({ 'Content-Type': image.avatar_type, 'Cache-Control': 'private, max-age=31536000, immutable' });
  res.send(image.avatar);
}));

const progressQuery = z.object({
  game: z.enum(['songless', 'blindtest', 'party']).default('songless'),
  period: z.enum(['week', 'month', 'all']).default('month'),
});

router.get('/:id/progress', route(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = progressQuery.safeParse(req.query);
  if (!id || !parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  res.json({ success: true, data: await progress(id, parsed.data.game, parsed.data.period) });
}));

export default router;
