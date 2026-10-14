import { Router } from 'express';
import { z } from 'zod';
import { parseId, route } from '../http.js';
import { getPreviewBytes } from '../services/deezer.js';
import { sliceLength } from '../services/songless.js';
import {
  answer, CLIP_MS, currentRoundTrack, getOwnedBlindtest, nextRound, publicBlindtest, startBlindtest,
} from '../services/blindtest.js';

const router = Router();

const startBody = z.object({
  source_id: z.number().int().positive().optional(),
  rounds: z.number().int().min(3).max(30).default(10),
  answer_mode: z.enum(['type', 'mcq']).default('mcq'),
  hits: z.boolean().default(false),
});

router.post('/start', route(async (req, res) => {
  const parsed = startBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const row = await startBlindtest(req.user!.id, {
    sourceId: parsed.data.source_id, rounds: parsed.data.rounds, mode: parsed.data.answer_mode, hits: parsed.data.hits,
  });
  res.json({ success: true, data: await publicBlindtest(row) });
}));

router.get('/:id', route(async (req, res) => {
  const row = await getOwnedBlindtest(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicBlindtest(row) });
}));

// The first 15 s of the current round's preview. Fetching it starts the clock.
router.get('/:id/audio', route(async (req, res) => {
  const row = await getOwnedBlindtest(parseId(req.params.id), req.user!.id);
  const track = await currentRoundTrack(row);
  const bytes = await getPreviewBytes(track.deezer_id);
  const body = bytes.subarray(0, sliceLength(bytes.length, CLIP_MS));
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(body.length) });
  res.send(body);
}));

const answerBody = z.object({
  deezer_id: z.number().int().positive().optional(),
  choice: z.number().int().min(0).max(3).optional(),
  give_up: z.boolean().optional(),
});

router.post('/:id/answer', route(async (req, res) => {
  const parsed = answerBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const row = await getOwnedBlindtest(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicBlindtest(await answer(row, parsed.data)) });
}));

router.post('/:id/next', route(async (req, res) => {
  const row = await getOwnedBlindtest(parseId(req.params.id), req.user!.id);
  res.json({ success: true, data: await publicBlindtest(await nextRound(row)) });
}));

export default router;
