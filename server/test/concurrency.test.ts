/**
 * Concurrency & race-condition tests. Disposable embedded PG only.
 * D5: orderNumber uses a dedicated sequence -> parallel creates cannot collide.
 * D6: concurrent simulations are serialized by a transaction-scoped
 *     advisory lock -> both succeed, final state is exactly one simulation.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'conc';
let base: string;
let db: Client;
let admin: string;

before(async () => {
  const booted = await bootPg(TAG, 56190);
  const url = await createDb(booted, 'conc_t');
  base = await startApp(url, 3350);
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0);
});

test('concurrent POST /orders x50 x3 runs: all succeed, unique orderNumbers', async () => {
  for (let run = 0; run < 3; run++) {
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        req(base, 'POST', '/orders', { customerId: (i % 30) + 1, boxCount: (i % 3) + 1 }, admin)
      )
    );
    const failed = results.filter((r) => r.status !== 201);
    assert.equal(
      failed.length, 0,
      `run ${run}: ${failed.length}/${N} creates failed: ${JSON.stringify(failed.slice(0, 3).map((r) => r.status))}`
    );
    const nums = results.map((r) => r.body.orderNumber);
    assert.equal(new Set(nums).size, N, `run ${run}: duplicate orderNumbers returned`);
    // every created order references a real customer and has valid fields
    const orphan = await db.query(
      `SELECT o.id FROM orders o LEFT JOIN customers c ON c.id = o."customerId"
       WHERE c.id IS NULL`
    );
    assert.equal(orphan.rows.length, 0, `run ${run}: orders with invalid customerId persisted`);
  }
  const total = (await db.query(
    `SELECT COUNT(*)::int c FROM orders WHERE "orderNumber" ~ '^ORD-[0-9]{6}-[0-9]+$'`
  )).rows[0].c;
  assert.equal(total, 150, 'expected 150 API-created orders across 3 runs');
});

test('concurrent simulate x2 x3 runs: both succeed (serialized), consistent final state', async () => {
  for (let run = 0; run < 3; run++) {
    const [a, b] = await Promise.all([
      req(base, 'POST', '/orders/simulate', { count: 15 }, admin),
      req(base, 'POST', '/orders/simulate', { count: 15 }, admin)
    ]);
    assert.equal(a.status, 200, `run ${run}: sim A -> ${a.status} ${JSON.stringify(a.body)}`);
    assert.equal(b.status, 200, `run ${run}: sim B -> ${b.status} ${JSON.stringify(b.body)}`);
    const orders = (await req(base, 'GET', '/orders', undefined, admin)).body;
    const nums = orders.map((o: any) => o.orderNumber);
    assert.equal(orders.length, 15, `run ${run}: expected 15 orders, got ${orders.length}`);
    assert.equal(new Set(nums).size, nums.length, `run ${run}: duplicate orderNumbers`);
    assert.ok(
      nums.every((n: string) => /^ORD-LUNCH-\d{3}$/.test(n)),
      `run ${run}: foreign/partial rows survived`
    );
    const orphan = await db.query(
      `SELECT o.id FROM orders o LEFT JOIN customers c ON c.id = o."customerId"
       WHERE c.id IS NULL`
    );
    assert.equal(orphan.rows.length, 0, `run ${run}: orders referencing missing customers`);
  }
});

test('pool pressure: 20 concurrent mixed reads all succeed', async () => {
  const paths = ['/customers', '/orders', '/riders', '/routes/current'];
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => req(base, 'GET', paths[i % paths.length], undefined, admin))
  );
  const ms = Date.now() - t0;
  console.log(`20 concurrent reads completed in ${ms}ms`);
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
});
