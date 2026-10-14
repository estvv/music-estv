import { Router } from 'express';
import { z } from 'zod';
import { generatePassword, hashPassword } from '../auth/crypto.js';
import { destroyUserSessions } from '../auth/session.js';
import { db } from '../db/index.js';
import { parseId, route } from '../http.js';
import { createSource, deleteSource, getSource, listSources, setInDailyPool, startSync } from '../services/sources.js';

const router = Router();

// --- users -------------------------------------------------------------------

router.get('/users', route(async (_req, res) => {
  const users = await db.all(`
    SELECT u.id, u.username, u.display_name, u.is_admin, u.disabled, u.created_at,
      sl.spotify_name
    FROM users u LEFT JOIN spotify_links sl ON sl.user_id = u.id
    ORDER BY u.created_at
  `);
  res.json({ success: true, data: users });
}));

const createUserBody = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, digits, _ . - only'),
  display_name: z.string().trim().min(1).max(40),
  is_admin: z.boolean().optional(),
});

router.post('/users', route(async (req, res) => {
  const parsed = createUserBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid' });
  }
  const { username, display_name, is_admin } = parsed.data;
  if (await db.get('SELECT 1 FROM users WHERE lower(username) = lower(?)', [username])) {
    return res.status(409).json({ success: false, error: 'Username already taken' });
  }

  const password = generatePassword();
  const user = await db.get(`
    INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, ?)
    RETURNING id, username, display_name
  `, [username, display_name, await hashPassword(password), Boolean(is_admin)]);

  // The generated password is shown once, to the admin, and never stored in clear.
  res.status(201).json({ success: true, data: { user, password } });
}));

const patchUserBody = z.object({
  display_name: z.string().trim().min(1).max(40).optional(),
  is_admin: z.boolean().optional(),
  disabled: z.boolean().optional(),
  reset_password: z.literal(true).optional(),
});

router.patch('/users/:id', route(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = patchUserBody.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  if (!(await db.get('SELECT 1 FROM users WHERE id = ?', [id]))) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  const { display_name, is_admin, disabled, reset_password } = parsed.data;
  if (id === req.user!.id && (is_admin === false || disabled === true)) {
    return res.status(400).json({ success: false, error: 'You cannot demote or disable yourself' });
  }

  if (display_name !== undefined) await db.run('UPDATE users SET display_name = ? WHERE id = ?', [display_name, id]);
  if (is_admin !== undefined) await db.run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin, id]);
  if (disabled !== undefined) {
    await db.run('UPDATE users SET disabled = ? WHERE id = ?', [disabled, id]);
    if (disabled) await destroyUserSessions(id);
  }

  let password: string | undefined;
  if (reset_password) {
    password = generatePassword();
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), id]);
    await destroyUserSessions(id);
  }

  res.json({ success: true, data: { password } });
}));

router.delete('/users/:id', route(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (id === req.user!.id) return res.status(400).json({ success: false, error: 'You cannot delete yourself' });
  await db.run('DELETE FROM users WHERE id = ?', [id]);
  res.json({ success: true });
}));

// --- sources -----------------------------------------------------------------

router.get('/sources', route(async (_req, res) => {
  res.json({ success: true, data: await listSources() });
}));

const createSourceBody = z.object({
  kind: z.enum(['deezer_playlist', 'spotify_playlist', 'spotify_liked']),
  ref: z.string().trim().max(300).default(''),
  in_daily_pool: z.boolean().default(true),
});

router.post('/sources', route(async (req, res) => {
  const parsed = createSourceBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  const source = await createSource({
    kind: parsed.data.kind, ref: parsed.data.ref, ownerId: req.user!.id, inDailyPool: parsed.data.in_daily_pool,
  });
  res.status(201).json({ success: true, data: source });
}));

router.patch('/sources/:id', route(async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = z.object({ in_daily_pool: z.boolean() }).safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ success: false, error: 'Invalid request' });
  await setInDailyPool(id, parsed.data.in_daily_pool);
  res.json({ success: true });
}));

router.post('/sources/:id/sync', route(async (req, res) => {
  const source = await getSource(parseId(req.params.id));
  if (!source) return res.status(404).json({ success: false, error: 'Source not found' });
  startSync(source);
  res.json({ success: true });
}));

router.delete('/sources/:id', route(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: 'Invalid id' });
  await deleteSource(id);
  res.json({ success: true });
}));

export default router;
