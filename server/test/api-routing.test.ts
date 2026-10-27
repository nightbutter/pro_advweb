/**
 * API tests for /api/riders and /api/routes (optimization + persistence).
 * Admin JWT required for optimize/current; rider routes allow own rider.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'apirouting';
let base: string;
let db: Client;
let admin: string;

before(async () => {
  const booted = await bootPg(TAG, 56140);
  const url = await createDb(booted, 'apirouting_t');
  base = await startApp(url, 3330);
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0);
});

test('GET /riders returns 13 seeded riders ordered by id', async () => {
  const { status, body } = await req(base, 'GET', '/riders', undefined, admin);
  assert.equal(status, 200);
  assert.equal(body.length, 13);
  assert.equal(body[0].id, 1);
  assert.equal(body[12].id, 13);
  for (const key of ['id', 'name', 'phone', 'color', 'maxOrders', 'status']) assert.ok(key in body[0]);
  assert.equal(body[0].maxOrders, 3);
  assert.equal(body[0].status, 'active');
});

test('GET /riders/:idOrCode supports id, TASK-NN, RD-NN formats', async () => {
  for (const [param, expected] of [['5', 5], ['TASK-05', 5], ['RD-05', 5]] as const) {
    const { status, body } = await req(base, 'GET', `/riders/${param}`, undefined, admin);
    assert.equal(status, 200, param);
    assert.equal(body.id, expected, param);
  }
});

test('GET /riders unknown -> 404; malformed/decimal/letterless-digitless -> 404', async () => {
  assert.equal((await req(base, 'GET', '/riders/99', undefined, admin)).status, 404);
  assert.equal((await req(base, 'GET', '/riders/TASK-99', undefined, admin)).status, 404);
  assert.equal((await req(base, 'GET', '/riders/abc', undefined, admin)).status, 404);
  assert.equal((await req(base, 'GET', '/riders/1.5', undefined, admin)).status, 404); // not pure int, no letters
  assert.equal((await req(base, 'GET', '/riders/TASK', undefined, admin)).status, 404);  // letters but no digits
  assert.equal((await req(base, 'GET', '/riders/--', undefined, admin)).status, 404);
});

test('POST /routes/optimize returns plan and persists assignments', async () => {
  const { status, body } = await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.routes));
  assert.ok(body.summary.totalOrders > 0);
  assert.ok(body.shopLocation.lat);

  const dbOrders = (await db.query(
    `SELECT id, status, "assignedRiderId", "deliverySequence" FROM orders`
  )).rows;
  assert.ok(dbOrders.every((o) => o.status === 'assigned'), 'not all orders marked assigned');
  assert.ok(dbOrders.every((o) => o.assignedRiderId !== null && o.deliverySequence !== null));

  // each route: <=3 orders (rider cap), sequence 1..n
  for (const route of body.routes) {
    assert.ok(route.orderCount <= 3, `rider ${route.riderId} has ${route.orderCount} orders`);
    const seqs = route.orders.map((o: any) => o.deliverySequence).sort((a: number, b: number) => a - b);
    assert.deepEqual(seqs, seqs.map((_: number, i: number) => i + 1));
    // DB-persisted riderId matches plan
    for (const o of route.orders) {
      const row = dbOrders.find((d) => d.id === o.id);
      assert.equal(row.assignedRiderId, route.riderId);
      assert.equal(row.deliverySequence, o.deliverySequence);
    }
  }
});

test('re-optimizing with different seed updates (not duplicates) assignments', async () => {
  const before1 = (await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c;
  await req(base, 'POST', '/routes/optimize', { seed: 3 }, admin);
  const after1 = (await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c;
  assert.equal(after1, before1, 'optimize must not create new orders');
});

test('GET /routes/current returns plan shape; rider view works', async () => {
  const { status, body } = await req(base, 'GET', '/routes/current', undefined, admin);
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.routes));
  assert.ok(body.summary);

  if (body.routes.length > 0) {
    const job = body.routes[0].jobCode;
    const r = await req(base, 'GET', `/routes/rider/${job}`, undefined, admin);
    assert.equal(r.status, 200);
    assert.equal(r.body.route.riderId, body.routes[0].riderId);
    assert.ok(r.body.shopLocation);
  }
});

test('GET /routes/rider/:id for unassigned rider -> 404', async () => {
  // rider 13 unlikely assigned when >13 clusters? just use an id with no route
  const plan = (await req(base, 'GET', '/routes/current', undefined, admin)).body;
  const used = new Set(plan.routes.map((r: any) => r.riderId));
  const free = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].find((i) => !used.has(i));
  if (free === undefined) return; // all riders assigned — skip gracefully
  const { status, body } = await req(base, 'GET', `/routes/rider/${free}`, undefined, admin);
  assert.equal(status, 404);
  assert.match(body.error, /ไม่พบใบงาน/);
});

test('optimize with zero orders returns empty-routes plan', async () => {
  await req(base, 'DELETE', '/orders', undefined, admin);
  const { status, body } = await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin);
  assert.equal(status, 200);
  assert.deepEqual(body.routes, []);
  assert.equal(body.summary.totalOrders, 0);
  assert.equal(body.summary.allOnTime, true);
});

test('plan counts respect 13-rider pool (cluster count <= riders used)', async () => {
  await req(base, 'POST', '/orders/simulate', { count: 28 }, admin);
  const { body } = await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin);
  const riderIds = new Set(body.routes.map((r: any) => r.riderId));
  assert.ok(riderIds.size <= 13);
});
