import { Router, type Request } from 'express';
import { z } from 'zod';
import { parseId, route } from '../http.js';
import { createSource, deleteSource, getSource, listSources, startSync } from '../services/sources.js';

// Playlists any account can add for free mode, blind tests and playlist quizzes.
// They are shared with everyone; only admins put a source in the daily pool
// (see routes/admin.ts).
const router = Router();

router.get('/', route(async (req, res) => {
  const data = (await listSources()).map(({ ref, ...s }) => ({
    ...s,
    mine: s.owner_id === req.user!.id,
    // Lets the home page tell which of the user's Spotify playlists are already in.
    spotify_id: s.kind === 'spotify_playlist' ? ref : null,
  }));
  res.json({ success: true, data });
}));

const createBody = z.object({
  kind: z.enum(['deezer_playlist', 'spotify_playlist', 'spotify_liked']),
  ref: z.string().trim().max(300).default(''),
  reuse: z.boolean().default(false),
});

router.post('/', route(async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const source = await createSource({ ...parsed.data, ownerId: req.user!.id, inDailyPool: false });
  res.status(201).json({ success: true, data: source });
}));

function canManage(req: Request, ownerId: number | null) {
  return Boolean(req.user!.is_admin) || ownerId === req.user!.id;
}

router.post('/:id/sync', route(async (req, res) => {
  const source = await getSource(parseId(req.params.id));
  if (!source) return res.status(404).json({ success: false, error: 'Source not found' });
  if (!canManage(req, source.owner_id)) return res.status(403).json({ success: false, error: 'Not your playlist' });
  startSync(source);
  res.json({ success: true });
}));

router.delete('/:id', route(async (req, res) => {
  const source = await getSource(parseId(req.params.id));
  if (!source) return res.status(404).json({ success: false, error: 'Source not found' });
  if (!canManage(req, source.owner_id)) return res.status(403).json({ success: false, error: 'Not your playlist' });
  await deleteSource(source.id);
  res.json({ success: true });
}));

export default router;
