import { afterAll, beforeAll } from 'vitest';
import { closeDatabase, initDatabase } from './db/index.js';

// Each test file runs in its own module scope, hence its own random schema
// (see db/index.ts): files can run in parallel against the same database.
beforeAll(async () => {
  await initDatabase();
});

afterAll(async () => {
  await closeDatabase();
});
