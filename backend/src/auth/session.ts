import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { randomToken, sha256 } from './crypto.js';

export const SESSION_COOKIE = 'music_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function createSession(res: Response, userId: number) {
  const token = randomToken();
  const expiresAt = Date.now() + SESSION_MS;
  await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [sha256(token), userId, expiresAt]);
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MS));
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export async function destroyUserSessions(userId: number, exceptReq?: Request) {
  const keep = exceptReq?.cookies?.[SESSION_COOKIE];
  if (keep) {
    await db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', [userId, sha256(keep)]);
  } else {
    await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  }
}

function cookieOptions(maxAge?: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure, path: '/', maxAge };
}

function findSessionUser(token: string): Promise<SessionUser | undefined> {
  return db.get<SessionUser>(`
    SELECT u.id, u.username, u.display_name, u.is_admin, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND NOT u.disabled
  `, [sha256(token), Date.now()]);
}

// For WebSocket upgrades, which bypass the Express middleware stack.
export async function userFromCookieHeader(header: string | undefined): Promise<SessionUser | undefined> {
  const match = header?.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return undefined;
  const user = await findSessionUser(decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)));
  // Same rule as requirePasswordChanged: no live features before the change.
  return user?.must_change_password ? undefined : user;
}

// Populates req.user when a valid session cookie is present. Never rejects.
export function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) return next();
  findSessionUser(token)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ success: false, error: 'Not authenticated' });
  next();
}

// A generated password (new account, reset) is known to the admin: until the
// user replaces it, only the routes needed to do so stay open.
const OPEN_WHILE_PENDING = new Set(['/auth/me', '/auth/password', '/auth/logout']);

export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.must_change_password && !OPEN_WHILE_PENDING.has(req.path)) {
    return void res.status(403).json({ success: false, error: 'Password change required' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireUser(req, res, () => {
    if (!req.user!.is_admin) return void res.status(403).json({ success: false, error: 'Admin only' });
    next();
  });
}

export async function purgeExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}
