import { db } from '../db/index.js';
import { getProfileImage } from './spotify.js';

// Profile pictures: an uploaded image wins, then the linked Spotify account's
// picture, then the Deezer one; without any the client shows a user icon.
//
// SQL expression for the avatar URL. Needs `users` aliased `u` and a
// `LEFT JOIN spotify_links sl ON sl.user_id = u.id`. Uploaded images are served
// by the API under a versioned URL, so they can be cached for good.
// chr(63) is "?": a literal one would be taken for a query placeholder.
export const AVATAR_URL_SQL = `CASE
  WHEN u.avatar_updated_at IS NOT NULL
    THEN '/api/players/' || u.id || '/avatar' || chr(63) || 'v=' || floor(extract(epoch FROM u.avatar_updated_at))::bigint
  ELSE COALESCE(NULLIF(sl.spotify_image, ''), (SELECT dl.image FROM deezer_links dl WHERE dl.user_id = u.id))
END`;

export const MAX_AVATAR_BYTES = 300 * 1024;

// Recognised by their first bytes, whatever the client claims.
export function sniffImageType(bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function setAvatar(userId: number, bytes: Buffer, type: string) {
  await db.run('UPDATE users SET avatar = ?, avatar_type = ?, avatar_updated_at = now() WHERE id = ?', [bytes, type, userId]);
}

export async function clearAvatar(userId: number) {
  await db.run('UPDATE users SET avatar = NULL, avatar_type = NULL, avatar_updated_at = NULL WHERE id = ?', [userId]);
}

export function getAvatar(userId: number) {
  return db.get<{ avatar: Buffer; avatar_type: string }>(
    'SELECT avatar, avatar_type FROM users WHERE id = ? AND avatar IS NOT NULL AND NOT disabled', [userId],
  );
}

// Links made before pictures were stored get theirs on first need. An empty
// string records "this account has no picture" so Spotify is not asked again.
export async function ensureSpotifyImage(userId: number) {
  const link = await db.get<{ spotify_image: string | null }>('SELECT spotify_image FROM spotify_links WHERE user_id = ?', [userId]);
  if (!link || link.spotify_image !== null) return;
  const image = await getProfileImage(userId).catch(() => null);
  await db.run('UPDATE spotify_links SET spotify_image = ? WHERE user_id = ?', [image ?? '', userId]);
}

export function avatarUrlOf(userId: number) {
  return db.get<{ avatar_url: string | null }>(`
    SELECT ${AVATAR_URL_SQL} AS avatar_url
    FROM users u LEFT JOIN spotify_links sl ON sl.user_id = u.id WHERE u.id = ?
  `, [userId]).then((r) => r?.avatar_url ?? null);
}
