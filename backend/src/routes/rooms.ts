import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireUser } from '../auth/session.js';
import { getPreviewBytes } from '../services/deezer.js';
import { clipMs, createRoom, currentTrack, playerByToken, requireRoom, RoomError } from '../services/rooms.js';
import { searchSongs } from '../services/search.js';
import { sliceLength } from '../services/songless.js';

// HTTP side of party rooms. Everything live goes through the WebSocket
// (realtime/roomSocket.ts); these routes create rooms and serve the host's audio.
const router = Router();

const createBody = z.object({
  game: z.enum(['blindtest', 'wholiked', 'songless']),
  answer_mode: z.enum(['mcq', 'type', 'buzzer']).default('mcq'),
  source_id: z.number().int().positive().optional(),
  rounds: z.number().int().min(3).max(30).default(10),
  hits: z.boolean().default(false),
});

router.post('/', requireUser, (req, res, next) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  try {
    const room = createRoom(req.user!, {
      game: parsed.data.game,
      answerMode: parsed.data.game === 'wholiked' ? 'mcq' : parsed.data.game === 'songless' ? 'type' : parsed.data.answer_mode,
      sourceId: parsed.data.source_id,
      rounds: parsed.data.rounds,
      hits: parsed.data.hits,
    });
    res.status(201).json({ success: true, data: { code: room.code } });
  } catch (e) {
    next(e);
  }
});

// Public: the join page checks the code before asking for a nickname.
router.get('/:code', (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    res.json({
      success: true,
      data: { code: room.code, game: room.game, answer_mode: room.answerMode, host_name: room.hostName, phase: room.phase },
    });
  } catch (e) {
    next(e);
  }
});

function requireHost(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, () => {
    const room = requireRoom(req.params.code);
    if (room.hostUserId !== req.user!.id) return void res.status(403).json({ success: false, error: 'Host only' });
    next();
  });
}

// Current round's clip, for the host screen only: phones never get audio.
router.get('/:code/audio', requireHost, async (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const track = currentTrack(room);
    const bytes = await getPreviewBytes(track.deezer_id);
    const body = bytes.subarray(0, sliceLength(bytes.length, clipMs(room)));
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'Content-Length': String(body.length) });
    res.send(body);
  } catch (e) {
    next(e);
  }
});

// Spotify id of the current round, when known, for Web Playback on the host.
router.get('/:code/spotify', requireHost, (req, res, next) => {
  try {
    res.json({ success: true, data: { spotify_id: currentTrack(requireRoom(req.params.code)).spotify_id } });
  } catch (e) {
    next(e);
  }
});

// Autocomplete for guests (no session): authorised by their room player token.
router.get('/:code/search', async (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const token = req.get('x-player-token') ?? '';
    if (!playerByToken(room, token)) throw new RoomError('Not in this room', 403);
    res.json({ success: true, data: await searchSongs(typeof req.query.q === 'string' ? req.query.q : '') });
  } catch (e) {
    next(e);
  }
});

export default router;
