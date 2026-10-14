import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { createSession, destroySession, destroyUserSessions } from '../auth/session.js';
import { db } from '../db/index.js';
import { getSpotifyLink } from '../services/spotify.js';
import { spotifyEnabled } from '../config.js';
import { route } from '../http.js';

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
  const link = await getSpotifyLink(req.user.id);
  res.json({
    success: true,
    data: {
      ...req.user,
      is_admin: Boolean(req.user.is_admin),
      spotify: link ? { name: link.spotify_name, id: link.spotify_user_id } : null,
      spotify_available: spotifyEnabled(),
    },
  });
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

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(parsed.data.next), req.user.id]);
  await destroyUserSessions(req.user.id, req);
  res.json({ success: true });
}));

export default router;
