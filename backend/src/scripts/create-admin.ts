// Bootstrap: create (or reset) an admin account from the command line.
//   npm run create-admin -- <username> [display name]
// In Docker: docker compose exec backend npm run create-admin -- <username>
import { generatePassword, hashPassword } from '../auth/crypto.js';
import { closeDatabase, db, initDatabase } from '../db/index.js';

const [username, ...nameParts] = process.argv.slice(2);
if (!username || !/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
  console.error('Usage: create-admin <username> [display name]');
  process.exit(1);
}

await initDatabase();
const password = generatePassword();
const hash = await hashPassword(password);
const displayName = nameParts.join(' ') || username;

const existing = await db.get('SELECT id FROM users WHERE lower(username) = lower(?)', [username]);
if (existing) {
  await db.run('UPDATE users SET password_hash = ?, is_admin = true, disabled = false WHERE lower(username) = lower(?)', [hash, username]);
  console.log(`Admin "${username}" reset.`);
} else {
  await db.run('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, true)', [username, displayName, hash]);
  console.log(`Admin "${username}" created.`);
}
console.log(`Password: ${password}`);
console.log('You can change it from your profile page.');
await closeDatabase();
