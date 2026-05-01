import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * Liveness + DB probe. Returns 200 with `{ ok: true, db: 'up' }` when
 * the Postgres pool can issue a trivial query in under 2 s. Any other
 * outcome → 503.
 *
 * Intended for VPS load balancers, uptime monitors, container
 * orchestrators. Cheap (single `SELECT 1`) so safe to poll every few
 * seconds.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await Promise.race([
      pool.query('SELECT 1 AS ok'),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('db timeout')), 2_000)),
    ]);
    if (!res || !('rows' in (res as object))) {
      throw new Error('db query returned no rows');
    }
    return NextResponse.json(
      { ok: true, db: 'up', ts: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: 'down',
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
