import { Router } from 'express';
import { z } from 'zod';
import { generatePassword, hashPassword } from '../auth/crypto.js';
import { destroyUserSessions } from '../auth/session.js';
import { db } from '../db/index.js';
import { parseId, route } from '../http.js';
import { AVATAR_URL_SQL } from '../services/avatars.js';

const router = Router();

const RESERVED_USERNAMES = new Set(['update', 'new', 'edit', 'me']);

// --- users -------------------------------------------------------------------

router.get('/users', route(async (_req, res) => {
  const users = await db.all(`
    SELECT u.id, u.username, u.display_name, u.is_admin, u.disabled, u.must_change_password, u.created_at,
      ${AVATAR_URL_SQL} AS avatar_url,
      sl.spotify_name
    FROM users u LEFT JOIN spotify_links sl ON sl.user_id = u.id
    ORDER BY u.created_at
  `);
  res.json({ success: true, data: users });
}));

const createUserBody = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, digits, _ . - only')
    // Taken by pages: /profiles/update is the profile editor, not a player.
    .refine((u) => !RESERVED_USERNAMES.has(u.toLowerCase()), 'This username is reserved'),
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
    INSERT INTO users (username, display_name, password_hash, is_admin, must_change_password) VALUES (?, ?, ?, ?, true)
    RETURNING id, username, display_name
  `, [username, display_name, await hashPassword(password), Boolean(is_admin)]);

  // The generated password is shown once, to the admin, and never stored in clear.
  res.status(201).json({ success: true, data: { user, password } });
}));

const patchUserBody = z.object({
  username: createUserBody.shape.username.optional(),
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

  const { username, display_name, is_admin, disabled, reset_password } = parsed.data;
  if (id === req.user!.id && (is_admin === false || disabled === true)) {
    return res.status(400).json({ success: false, error: 'You cannot demote or disable yourself' });
  }

  // Login names are case-insensitive: "Tom" and "tom" are the same account.
  if (username !== undefined) {
    if (await db.get('SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?', [username, id])) {
      return res.status(409).json({ success: false, error: 'Username already taken' });
    }
    await db.run('UPDATE users SET username = ? WHERE id = ?', [username, id]);
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
    await db.run('UPDATE users SET password_hash = ?, must_change_password = true WHERE id = ?', [await hashPassword(password), id]);
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

export default router;
