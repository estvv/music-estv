import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { createSession, destroySession, destroyUserSessions } from '../auth/session.js';
import { db } from '../db/index.js';
import { getSpotifyLink } from '../services/spotify.js';
import { getDeezerLink } from '../services/deezer.js';
import { spotifyEnabled } from '../config.js';
import { route } from '../http.js';
import { HttpError } from '../errors.js';
import { getTrack } from '../services/deezer.js';
import { getTrackByDeezerId, upsertDeezerTrack } from '../services/tracks.js';
import {
  avatarUrlOf, clearAvatar, ensureSpotifyImage, MAX_AVATAR_BYTES, setAvatar, sniffImageType,
} from '../services/avatars.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Too many attempts, try again later' },
});

// Computed once so an unknown username costs as much as a wrong password.
const dummyHash = hashPassword('dummy-password-for-timing');

const loginBody = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

router.post('/login', loginLimiter, route(async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid credentials' });

  const user = await db.get<{ id: number; password_hash: string; disabled: boolean }>(
    'SELECT id, password_hash, disabled FROM users WHERE lower(username) = lower(?)', [parsed.data.username],
  );

  const ok = await verifyPassword(parsed.data.password, user?.password_hash ?? await dummyHash);
  if (!user || !ok || user.disabled) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  await createSession(res, user.id);
  res.json({ success: true });
}));

router.post('/logout', route(async (req, res) => {
  await destroySession(req, res);
  res.json({ success: true });
}));

router.get('/me', route(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  await ensureSpotifyImage(req.user.id);
  const [link, deezer, avatarUrl, custom] = await Promise.all([
    getSpotifyLink(req.user.id),
    getDeezerLink(req.user.id),
    avatarUrlOf(req.user.id),
    db.get<{ yes: boolean }>('SELECT avatar_updated_at IS NOT NULL AS yes FROM users WHERE id = ?', [req.user.id]),
  ]);
  res.json({
    success: true,
    data: {
      ...req.user,
      is_admin: Boolean(req.user.is_admin),
      must_change_password: Boolean(req.user.must_change_password),
      avatar_url: avatarUrl,
      // True when the picture is an upload (it can be removed), false when it
      // comes from Spotify or is the default icon.
      avatar_custom: Boolean(custom?.yes),
      spotify: link ? { name: link.spotify_name, id: link.spotify_user_id } : null,
      deezer: deezer ? { name: deezer.name, id: deezer.deezer_user_id } : null,
      spotify_available: spotifyEnabled(),
    },
  });
}));

// The browser sends the picture already cropped and resized (see the profile
// page); the server only checks it is a real, small image.
router.put('/avatar', express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }), route(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const type = sniffImageType(bytes);
  if (!type) return res.status(400).json({ success: false, error: 'Not a JPEG, PNG or WebP image' });
  await setAvatar(req.user.id, bytes, type);
  res.json({ success: true, data: { avatar_url: await avatarUrlOf(req.user.id) } });
}));

router.delete('/avatar', route(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  await clearAvatar(req.user.id);
  res.json({ success: true, data: { avatar_url: await avatarUrlOf(req.user.id) } });
}));

const passwordBody = z.object({
  current: z.string().min(1).max(256),
  next: z.string().min(10, 'At least 10 characters').max(256),
});

router.post('/password', route(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const parsed = passwordBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' });
  }

  const row = (await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user.id]))!;
  if (!(await verifyPassword(parsed.data.current, row.password_hash))) {
    return res.status(400).json({ success: false, error: 'Current password is wrong' });
  }
  if (parsed.data.current === parsed.data.next) {
    return res.status(400).json({ success: false, error: 'Choose a different password' });
  }

  await db.run('UPDATE users SET password_hash = ?, must_change_password = false WHERE id = ?', [
    await hashPassword(parsed.data.next), req.user.id,
  ]);
  await destroyUserSessions(req.user.id, req);
  res.json({ success: true });
}));

const profileBody = z.object({
  bio: z.string().trim().max(280).nullable().optional(),
  // In display order; the whole list is replaced.
  favorite_deezer_ids: z.array(z.number().int().positive()).max(5, 'At most 5 favourites')
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate favourite').optional(),
});

// The public part of a profile: bio and favourite songs.
router.patch('/profile', route(async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const parsed = profileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' });
  const { bio, favorite_deezer_ids } = parsed.data;

  if (bio !== undefined) await db.run('UPDATE users SET bio = ? WHERE id = ?', [bio || null, req.user.id]);
  if (favorite_deezer_ids !== undefined) {
    // Resolve every song first (unknown ones come from Deezer), then swap the list.
    const trackIds: number[] = [];
    for (const deezerId of favorite_deezer_ids) {
      const cached = await getTrackByDeezerId(deezerId);
      trackIds.push(cached?.id ?? (await upsertDeezerTrack(await getTrack(deezerId).catch(() => {
        throw new HttpError('Unknown track', 404);
      }))).id);
    }
    const userId = req.user.id;
    await db.tx(async (t) => {
      await t.run('DELETE FROM user_favorites WHERE user_id = ?', [userId]);
      for (const [position, trackId] of trackIds.entries()) {
        await t.run('INSERT INTO user_favorites (user_id, position, track_id) VALUES (?, ?, ?)', [userId, position, trackId]);
      }
    });
  }
  res.json({ success: true });
}));

export default router;
