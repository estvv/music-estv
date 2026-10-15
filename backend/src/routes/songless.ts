import { Router } from 'express';
import { z } from 'zod';
import { parseId, route } from '../http.js';
import { getPreviewBytes } from '../services/deezer.js';
import { searchSongs } from '../services/search.js';
import { giveUp, guess, getOwnedGame, publicState, skip, sliceLength, startGame, STEPS_MS, MAX_STEPS } from '../services/songless.js';
import { getVisibleSource } from '../services/sources.js';
import { getTrackById } from '../services/tracks.js';

const router = Router();

router.get('/search', route(async (req, res) => {
  res.json({ success: true, data: await searchSongs(typeof req.query.q === 'string' ? req.query.q : '') });
}));

const startBody = z.object({ source_id: z.number().int().positive() });

router.post('/start', route(async (req, res) => {
  const parsed = startBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  await getVisibleSource(parsed.data.source_id, req.user!.id);
  const game = await startGame(req.user!.id, parsed.data.source_id);
  res.json({ success: true, data: await publicState(game) });
}));

router.get('/:id', route(async (req, res) => {
  const game = await getOwnedGame(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicState(game) });
}));

// Serves only the bytes for the unlocked duration: the full clip never reaches
// the client before the game is over.
router.get('/:id/audio', route(async (req, res) => {
  const game = await getOwnedGame(parseId(req.params.id), req.user!.id);
  const track = (await getTrackById(game.track_id))!;
  const bytes = await getPreviewBytes(track.deezer_id);
  const ms = game.status === 'playing' ? STEPS_MS[Math.min(game.step, MAX_STEPS - 1)] : 30000;
  const body = bytes.subarray(0, sliceLength(bytes.length, ms));
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(body.length) });
  res.send(body);
}));

router.post('/:id/guess', route(async (req, res) => {
  const parsed = z.object({ deezer_id: z.number().int().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const game = await getOwnedGame(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicState(await guess(game, parsed.data.deezer_id)) });
}));

router.post('/:id/skip', route(async (req, res) => {
  const game = await getOwnedGame(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicState(await skip(game)) });
}));

router.post('/:id/give-up', route(async (req, res) => {
  const game = await getOwnedGame(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicState(await giveUp(game)) });
}));

export default router;
