import { defineConfig } from 'vitest/config';

// Tests need PostgreSQL: the dev `db` container (127.0.0.1:5434) or
// DATABASE_URL. Each test file works in a throwaway schema.
export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    setupFiles: ['src/test-setup.ts'],
  },
});
