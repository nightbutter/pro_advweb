/**
 * Seed & initialization tests — exercises initDatabase() directly and the
 * startup binary path via subprocesses for failure modes.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { bootPg, createDb, connectDb, shutdownPg, runScript, req } from './helpers';
import type { Client } from 'pg';

const TAG = 'seeds';
let booted: Awaited<ReturnType<typeof bootPg>>;

before(async () => {
  booted = await bootPg(TAG, 56160);
});

after(async () => {
  try {
    const { pool } = await import('../dbconnect');
    await pool.end();
  } catch {}
  await shutdownPg(TAG);
  process.exit(0);
});

test('initDatabase on fresh DB: tables + 13 riders, 60 customers, 30 orders, 14 users', async () => {
  const url = await createDb(booted, 'seeds_fresh');
  process.env.DATABASE_URL = url;
  const { initDatabase, pool } = await import('../dbconnect');
  await initDatabase();

  const db = await connectDb(url);
  const counts = (await db.query(`
    SELECT (SELECT COUNT(*)::int FROM riders) r,
           (SELECT COUNT(*)::int FROM customers) c,
           (SELECT COUNT(*)::int FROM orders) o,
           (SELECT COUNT(*)::int FROM users) u`)).rows[0];
  assert.deepEqual(counts, { r: 13, c: 60, o: 30, u: 14 });

  // every customer carries one of the three zones
  const badZones = (await db.query(
    `SELECT COUNT(*)::int c FROM customers WHERE zone NOT IN ('ขามเรียง','ท่าขอนยาง','หน้าป้าย')`
  )).rows[0].c;
  assert.equal(badZones, 0, 'customers missing a valid zone');
  // seeded logins: admin + rider01..rider13
  const roles = (await db.query(`SELECT role, COUNT(*)::int c FROM users GROUP BY role ORDER BY role`)).rows;
  assert.deepEqual(roles, [{ role: 'admin', c: 1 }, { role: 'rider', c: 13 }]);

  const orders = (await db.query(`SELECT "orderNumber","orderTime","customerId" FROM orders`)).rows;
  assert.ok(orders.every((o) => /^ORD-20261003-\d{3}$/.test(o.orderNumber)));
  assert.ok(orders.every((o) => o.orderTime === '10:15:00'));
  const custIds = new Set((await db.query('SELECT id FROM customers')).rows.map((r) => r.id));
  assert.ok(orders.every((o) => custIds.has(o.customerId)), 'seed order FK integrity broken');
  const riderIds = (await db.query('SELECT id FROM riders ORDER BY id')).rows.map((r) => r.id);
  assert.deepEqual(riderIds, Array.from({ length: 13 }, (_, i) => i + 1));
  await db.end();
});

test('initDatabase re-run is idempotent (no duplicate seeds)', async () => {
  const { initDatabase, query } = await import('../dbconnect');
  await initDatabase(); // second run on same DATABASE_URL from previous test
  const { rows } = await query(`SELECT COUNT(*)::int c FROM riders`);
  assert.equal(rows[0].c, 13);
});

test('partially seeded DB (1 rider exists): rider seed skipped entirely', async () => {
  const url = await createDb(booted, 'seeds_partial');
  const db = await connectDb(url);
  // minimal schema then one stray rider
  await db.query(`
    CREATE TABLE riders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
      color TEXT NOT NULL, "maxOrders" INTEGER DEFAULT 3, status TEXT DEFAULT 'active');
    INSERT INTO riders (id,name,phone,color) VALUES (99,'stray','p','#000');
  `);
  // point the already-imported module at... module pool is bound to first URL;
  // use runScript to init against the other DB in a clean process instead.
  const res = await runScript('test/bin/init-db.ts', { DATABASE_URL: url });
  assert.equal(res.code, 0, res.stderr);
  const riderCount = (await db.query('SELECT COUNT(*)::int c FROM riders')).rows[0].c;
  const custCount = (await db.query('SELECT COUNT(*)::int c FROM customers')).rows[0].c;
  const ordCount = (await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c;
  assert.equal(riderCount, 1, 'documented: non-empty riders table skips ALL rider seeds');
  assert.equal(custCount, 60);
  assert.equal(ordCount, 30);
  await db.end();
});

test('two concurrent initDatabase() on empty DB — serialized by advisory lock, x5', async () => {
  // Advisory-lock fix (D3): every run must complete with 0 rejections.
  for (let i = 0; i < 5; i++) {
    const url = await createDb(booted, `seeds_race_${i}`);
    const res = await runScript('test/bin/init-race.ts', { DATABASE_URL: url });
    assert.equal(res.code, 0, res.stderr + res.stdout);
    const outcome = JSON.parse(res.stdout.trim().split('\n').pop()!);
    assert.equal(outcome.rejected, 0, `run ${i}: init raced and failed: ${JSON.stringify(outcome)}`);
    const db = await connectDb(url);
    const riders = (await db.query('SELECT COUNT(*)::int c FROM riders')).rows[0].c;
    const customers = (await db.query('SELECT COUNT(*)::int c FROM customers')).rows[0].c;
    const orders = (await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c;
    await db.end();
    assert.deepEqual({ riders, customers, orders }, { riders: 13, customers: 60, orders: 30 },
      `run ${i}: inconsistent seed state after concurrent init`);
  }
});

test('startup without DATABASE_URL exits non-zero with clear message', async () => {
  // empty strings override any DATABASE_URL leaking from process.env / .env
  const res = await runScript('server.ts', { DATABASE_URL: '', DATABASE_URL_UNPOOLED: '' });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr + res.stdout, /DATABASE_URL is not set/);
});

test('startup with unreachable DB exits non-zero', async () => {
  const res = await runScript('server.ts', {
    DATABASE_URL: 'postgres://postgres:postgres@localhost:59999/x?sslmode=disable',
    PORT: '3400'
  });
  assert.notEqual(res.code, 0);
});

test('init failure before first request -> controlled 503 JSON, no worker crash', async () => {
  // VERCEL=1 path: initDatabase failure must NOT crash the process (D4 fix).
  // JWT_SECRET is required at import time in production mode — supply a dummy.
  const res = await runScript('test/bin/probe-init-failure.ts', {
    DATABASE_URL: 'postgres://postgres:postgres@localhost:59999/x?sslmode=disable',
    VERCEL: '1',
    JWT_SECRET: 'test-secret'
  });
  assert.equal(res.code, 0, `worker crashed: ${res.stderr}`);
  const out = JSON.parse(res.stdout.trim().split('\n').pop()!);
  assert.equal(out.status, 503);
  assert.match(out.contentType ?? '', /application\/json/, 'error must follow JSON contract');
  assert.match(out.bodyPreview, /error/);
});
