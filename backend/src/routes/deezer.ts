import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { route } from '../http.js';
import { DeezerError, getDeezerLink, getUser, getUserPlaylists, parseProfileRef } from '../services/deezer.js';

// Deezer profile linking (public data only, see deezer_links in schema.sql).
const router = Router();

router.post('/link', route(async (req, res) => {
  const parsed = z.object({ ref: z.string().trim().min(1).max(300) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const id = await parseProfileRef(parsed.data.ref);
  if (!id) return res.status(400).json({ success: false, error: 'Not a Deezer profile link' });
  const user = await getUser(id).catch((e) => {
    if (e instanceof DeezerError && !e.transient) return null;
    throw e;
  });
  if (!user) return res.status(404).json({ success: false, error: 'Deezer profile not found' });
  await db.run(`
    INSERT INTO deezer_links (user_id, deezer_user_id, name, image) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET deezer_user_id = excluded.deezer_user_id, name = excluded.name,
      image = excluded.image, linked_at = now()
  `, [req.user!.id, user.id, user.name, user.picture_medium ?? null]);
  res.json({ success: true, data: { id: user.id, name: user.name } });
}));

router.delete('/link', route(async (req, res) => {
  await db.run('DELETE FROM deezer_links WHERE user_id = ?', [req.user!.id]);
  res.json({ success: true });
}));

// The linked profile's public playlists, for the import modal.
router.get('/playlists', route(async (req, res) => {
  const link = await getDeezerLink(req.user!.id);
  if (!link) return res.status(409).json({ success: false, error: 'Link your Deezer profile first' });
  const playlists = await getUserPlaylists(link.deezer_user_id);
  res.json({
    success: true,
    data: playlists.map((p) => ({
      id: String(p.id), name: p.is_loved_track ? 'Coups de cœur' : p.title, total: p.nb_tracks,
      image: p.picture_medium ?? null, loved: p.is_loved_track,
    })),
  });
}));

export default router;
