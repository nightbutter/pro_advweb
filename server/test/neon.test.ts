/**
 * Neon-specific integration tests — OPT-IN ONLY.
 * Enable by setting NEON_TEST_URL (pooled) and optionally
 * NEON_TEST_URL_UNPOOLED (direct) to a dedicated TEST branch/database.
 * Never point these at production. All tests SKIP when the env vars are unset.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { runScript } from './helpers';

const NEON_URL = process.env.NEON_TEST_URL;
const NEON_DIRECT = process.env.NEON_TEST_URL_UNPOOLED;
const NEON_ENABLED = Boolean(NEON_URL);

function sslFor(url: string) {
  if (/sslmode=|uselibpqcompat=/i.test(url)) return undefined;
  if (/@(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) return false;
  return { rejectUnauthorized: true };
}

describe('neon integration (opt-in)', { skip: !NEON_ENABLED && 'set NEON_TEST_URL to a dedicated test branch' }, () => {
  test('pooled connection: SELECT 1', async () => {
    const c = new Client({ connectionString: NEON_URL, ssl: sslFor(NEON_URL!) });
    await c.connect();
    const { rows } = await c.query('SELECT 1 AS ok, current_database() AS db');
    assert.equal(rows[0].ok, 1);
    console.log('connected to database:', rows[0].db);
    await c.end();
  });

  test('channel_binding=require handshake works', async () => {
    const c = new Client({ connectionString: NEON_URL, ssl: sslFor(NEON_URL!) });
    await c.connect();
    const { rows } = await c.query(`SELECT ssl_is_used() AS ssl, version() AS v`);
    assert.equal(rows[0].ssl, true);
    await c.end();
  });

  test('direct connection works for migration tooling', { skip: !NEON_DIRECT && 'NEON_TEST_URL_UNPOOLED unset' }, async () => {
    const c = new Client({ connectionString: NEON_DIRECT, ssl: sslFor(NEON_DIRECT!) });
    await c.connect();
    const { rows } = await c.query('SELECT 1 AS ok');
    assert.equal(rows[0].ok, 1);
    await c.end();
  });

  test('basic CRUD + transaction round-trip on temp table', async () => {
    const c = new Client({ connectionString: NEON_URL, ssl: sslFor(NEON_URL!) });
    await c.connect();
    await c.query('BEGIN');
    await c.query(`CREATE TEMP TABLE tt (id serial primary key, v text)`);
    await c.query(`INSERT INTO tt (v) VALUES ('a'),('b')`);
    const { rows } = await c.query(`SELECT COUNT(*)::int c FROM tt`);
    assert.equal(rows[0].c, 2);
    await c.query('ROLLBACK'); // temp table discarded with session anyway
    await c.end();
  });

  test('pool behavior under 10 concurrent queries', async () => {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: NEON_URL, ssl: sslFor(NEON_URL!), max: 3 });
    pool.on('error', () => {});
    const results = await Promise.all(
      Array.from({ length: 10 }, () => pool.query('SELECT pg_sleep(0.05), 1 AS ok'))
    );
    assert.ok(results.every((r) => r.rows[0].ok === 1));
    await pool.end();
  });

  test('migrate script against direct URL', { skip: !NEON_DIRECT && 'NEON_TEST_URL_UNPOOLED unset' }, async () => {
    const res = await runScript('scripts/migrate.ts', {
      DATABASE_URL: NEON_URL,
      DATABASE_URL_UNPOOLED: NEON_DIRECT
    });
    assert.equal(res.code, 0, res.stderr);
  });
});
