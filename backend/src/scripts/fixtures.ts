// Base data for a fresh database: the admin account and a first playlist.
//   npm run db:fixtures                (local, or `docker compose exec backend npm run db:fixtures`)
// Idempotent: an existing admin is left untouched (use create-admin to reset a
// password), an existing playlist is not added twice.
import { generatePassword, hashPassword } from '../auth/crypto.js';
import { closeDatabase, db, initDatabase } from '../db/index.js';
import { getSource, syncSourceNow } from '../services/sources.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_DISPLAY_NAME = process.env.ADMIN_DISPLAY_NAME || ADMIN_USERNAME;
// Deezer "Top Worldwide": public, refreshed by Deezer, a sensible first playlist.
const DEFAULT_PLAYLIST = { ref: '3155776842', name: 'Top Worldwide' };

async function ensureAdmin(): Promise<number> {
  const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE lower(username) = lower(?)', [ADMIN_USERNAME]);
  if (existing) {
    console.log(`Admin "${ADMIN_USERNAME}" already exists, left unchanged.`);
    return existing.id;
  }
  const password = generatePassword();
  const user = (await db.get<{ id: number }>(`
    INSERT INTO users (username, display_name, password_hash, is_admin, must_change_password) VALUES (?, ?, ?, true, true) RETURNING id
  `, [ADMIN_USERNAME, ADMIN_DISPLAY_NAME, await hashPassword(password)]))!;
  console.log(`Admin "${ADMIN_USERNAME}" created. Password: ${password}`);
  console.log('It must be changed at the first login.');
  return user.id;
}

async function ensureDefaultPlaylist(ownerId: number) {
  const existing = await db.get(`SELECT id FROM sources WHERE kind = 'deezer_playlist' AND ref = ?`, [DEFAULT_PLAYLIST.ref]);
  if (existing) {
    console.log(`Playlist "${DEFAULT_PLAYLIST.name}" already present.`);
    return;
  }
  const { id } = (await db.get<{ id: number }>(`
    INSERT INTO sources (kind, ref, name, owner_id) VALUES ('deezer_playlist', ?, ?, ?) RETURNING id
  `, [DEFAULT_PLAYLIST.ref, DEFAULT_PLAYLIST.name, ownerId]))!;
  try {
    await syncSourceNow((await getSource(id))!);
    const { n } = (await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM source_tracks WHERE source_id = ?', [id]))!;
    console.log(`Playlist "${DEFAULT_PLAYLIST.name}" added (${n} playable tracks).`);
  } catch (e) {
    console.warn(`Playlist "${DEFAULT_PLAYLIST.name}" added but its import failed (${e instanceof Error ? e.message : e}); resync it from the Playlists page.`);
  }
}

await initDatabase();
const adminId = await ensureAdmin();
await ensureDefaultPlaylist(adminId);
await closeDatabase();
