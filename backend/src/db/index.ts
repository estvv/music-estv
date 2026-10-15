import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// int8 (COUNT, SUM, BIGINT columns) as JS numbers: every value here fits, and
// the rest of the code expects numbers. DATE as its 'YYYY-MM-DD' text, the
// format the daily puzzles are keyed on.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

// Tests: each test file gets its own throwaway schema in the test database.
const testSchema = process.env.NODE_ENV === 'test' ? `test_${randomBytes(6).toString('hex')}` : null;

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
if (testSchema) {
  pool.on('connect', (client) => {
    client.query(`SET search_path TO ${testSchema}`).catch(() => undefined);
  });
}

type Param = string | number | boolean | null | undefined | Date | number[] | string[] | Buffer;
type Queryable = pg.Pool | pg.PoolClient;

// `?` placeholders (as in the SQLite days) become $1, $2… No query in this
// codebase has a literal question mark.
function numbered(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

function helpers(q: Queryable) {
  return {
    async all<T>(text: string, params: Param[] = []): Promise<T[]> {
      return (await q.query(numbered(text), params)).rows as T[];
    },
    async get<T>(text: string, params: Param[] = []): Promise<T | undefined> {
      return (await q.query(numbered(text), params)).rows[0] as T | undefined;
    },
    async run(text: string, params: Param[] = []): Promise<number> {
      return (await q.query(numbered(text), params)).rowCount ?? 0;
    },
  };
}

export const db = {
  ...helpers(pool),
  // Runs fn inside a transaction on a dedicated connection.
  async tx<T>(fn: (t: ReturnType<typeof helpers>) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(helpers(client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

// Idempotent: the schema only uses CREATE … IF NOT EXISTS.
export async function initDatabase() {
  if (testSchema) await pool.query(`CREATE SCHEMA IF NOT EXISTS ${testSchema}`);
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));
}

export async function closeDatabase() {
  if (testSchema) await pool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`).catch(() => undefined);
  await pool.end();
}
