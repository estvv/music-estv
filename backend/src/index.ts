import { config } from './config.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth/session.js';
import { initDatabase } from './db/index.js';
import { attachRoomSockets } from './realtime/roomSocket.js';

await initDatabase();
const app = createApp();

const purge = () => purgeExpiredSessions().catch((e) => console.error('Session purge failed:', e));
purge();
setInterval(purge, 6 * 60 * 60 * 1000).unref();

const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

attachRoomSockets(server);

// Slowloris / idle-socket protection.
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
