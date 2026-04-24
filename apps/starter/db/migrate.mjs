#!/usr/bin/env node
/**
 * Migration runner — reads db/schema.sql and applies it against DATABASE_URL.
 *
 * Idempotent: every CREATE uses `IF NOT EXISTS`. Re-running is safe.
 *
 * Usage:
 *   node db/migrate.mjs                         # uses $DATABASE_URL
 *   DATABASE_URL=postgres://... node db/migrate.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, 'schema.sql');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL. Copy .env.example to .env and set it.');
  process.exit(1);
}

const sql = readFileSync(schemaPath, 'utf8');

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  console.log(`Connected to ${new URL(url).host}`);
  // Single transaction — all or nothing.
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅ Schema applied');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
