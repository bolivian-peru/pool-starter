import { Pool } from 'pg';

/**
 * Postgres connection pool. Singleton across hot-reloads in dev.
 *
 * One place to tune connection limits. Defaults here match a small
 * Docker Postgres; bump `max` on your production host.
 */
declare global {
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill in your Postgres connection string.',
    );
  }
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export const pool: Pool = globalThis.__pgPool ?? makePool();
if (process.env.NODE_ENV !== 'production') {
  globalThis.__pgPool = pool;
}

/** Thin `query` wrapper — returns `rows`. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/** Same as {@link query}, but returns the first row or `null`. */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
