import { Router, type Request } from 'express';
import { z } from 'zod';
import { parseId, route } from '../http.js';
import {
  createSource, deleteSource, getSource, getSourceTracks, getVisibleSource, listSources, setPublic, startSync,
} from '../services/sources.js';

// Playlists any account can add for Songless, blind tests and party rooms.
// Public ones are shared with everyone, private ones stay with their owner;
// the owner (or an admin) manages each one.
const router = Router();

router.get('/', route(async (req, res) => {
  const data = (await listSources(req.user!.id)).map(({ ref, ...s }) => ({
    ...s,
    mine: s.owner_id === req.user!.id,
    // Lets the home page tell which of the user's Spotify playlists are already in.
    spotify_id: s.kind === 'spotify_playlist' ? ref : null,
    // Same for Deezer playlists (public by nature).
    deezer_id: s.kind === 'deezer_playlist' ? ref : null,
  }));
  res.json({ success: true, data });
}));

// Anyone who can see a playlist can browse what is inside.
router.get('/:id/tracks', route(async (req, res) => {
  const source = await getVisibleSource(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await getSourceTracks(source.id) });
}));

const createBody = z.object({
  kind: z.enum(['deezer_playlist', 'spotify_playlist', 'spotify_liked']),
  ref: z.string().trim().max(300).default(''),
  is_public: z.boolean().default(true),
});

router.post('/', route(async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const { kind, ref, is_public } = parsed.data;
  const source = await createSource({ kind, ref, ownerId: req.user!.id, isPublic: is_public });
  res.status(201).json({ success: true, data: source });
}));

function canManage(req: Request, ownerId: number | null) {
  return Boolean(req.user!.is_admin) || ownerId === req.user!.id;
}

// Visibility is the owner's call only: an admin can remove a playlist but not
// publish someone's private one.
router.patch('/:id', route(async (req, res) => {
  const parsed = z.object({ is_public: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const source = await getSource(parseId(req.params.id));
  if (!source) return res.status(404).json({ success: false, error: 'Source not found' });
  if (source.owner_id !== req.user!.id) return res.status(403).json({ success: false, error: 'Not your playlist' });
  await setPublic(source.id, parsed.data.is_public);
  res.json({ success: true });
}));

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
