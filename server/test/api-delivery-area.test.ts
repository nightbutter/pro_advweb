import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'apiarea';
let base: string;
let db: Client;
let admin: string;
let farCustomerId: number;

const IN_RANGE = { lat: 16.2726, lng: 103.2505 };
const JUST_OUTSIDE = { lat: 16.2744, lng: 103.2505 };
const FAR = { lat: 16.3, lng: 103.2505 };

before(async () => {
  const booted = await bootPg(TAG, 56210);
  const url = await createDb(booted, 'apiarea_t');
  base = await startApp(url, 3370);
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
  const { rows } = await db.query(
    `INSERT INTO customers (name, phone, address, lat, lng, zone)
     VALUES ('ลูกค้าไกล', '0800000000', 'นอกพื้นที่', $1, $2, 'ขามเรียง') RETURNING id`,
    [FAR.lat, FAR.lng]
  );
  farCustomerId = rows[0].id;
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0);
});

const customer = (p: { lat: number; lng: number }) => ({ name: 'ทดสอบพื้นที่', phone: '0811111111', address: 'ขามเรียง', ...p });

test('POST /customers inside 3 km -> 201, outside -> 400 with distance in message', async () => {
  assert.equal((await req(base, 'POST', '/customers', customer(IN_RANGE), admin)).status, 201);

  const outside = await req(base, 'POST', '/customers', customer(JUST_OUTSIDE), admin);
  assert.equal(outside.status, 400);
  assert.match(outside.body.error, /นอกพื้นที่จัดส่ง/);
  assert.match(outside.body.error, /3\.10 กม\./);

  const count = await db.query(`SELECT COUNT(*)::int AS n FROM customers WHERE lat = $1`, [JUST_OUTSIDE.lat]);
  assert.equal(count.rows[0].n, 0, 'out-of-area customer must not be saved');
});

test('PUT /customers/:id moving the pin outside -> 400 and row unchanged', async () => {
  const created = (await req(base, 'POST', '/customers', customer(IN_RANGE), admin)).body;
  const { status } = await req(base, 'PUT', `/customers/${created.id}`, customer(FAR), admin);
  assert.equal(status, 400);
  const row = await db.query('SELECT lat FROM customers WHERE id = $1', [created.id]);
  assert.equal(row.rows[0].lat, IN_RANGE.lat);
});

test('POST /orders for an out-of-area customer -> 400', async () => {
  const { status, body } = await req(base, 'POST', '/orders', { customerId: farCustomerId, boxCount: 1 }, admin);
  assert.equal(status, 400);
  assert.match(body.error, /นอกพื้นที่จัดส่ง/);
});

test('PUT /orders/:id switching to an out-of-area customer -> 400; editing boxes of an existing one -> 200', async () => {
  const inside = (await req(base, 'POST', '/customers', customer(IN_RANGE), admin)).body;
  const order = (await req(base, 'POST', '/orders', { customerId: inside.id, boxCount: 1 }, admin)).body;
  assert.equal((await req(base, 'PUT', `/orders/${order.id}`, { customerId: farCustomerId }, admin)).status, 400);

  const { rows } = await db.query(
    `INSERT INTO orders ("orderNumber", "customerId", "boxCount", status) VALUES ('FAR-EDIT', $1, 1, 'pending') RETURNING id`,
    [farCustomerId]
  );
  assert.equal((await req(base, 'PUT', `/orders/${rows[0].id}`, { boxCount: 2 }, admin)).status, 200);
});

test('POST /orders/simulate never picks out-of-area customers', async () => {
  const { status } = await req(base, 'POST', '/orders/simulate', { count: 100 }, admin);
  assert.equal(status, 200);
  const far = await db.query('SELECT COUNT(*)::int AS n FROM orders WHERE "customerId" = $1', [farCustomerId]);
  assert.equal(far.rows[0].n, 0);
});

test('POST /routes/optimize reports out-of-area orders and clears a previous assignment', async () => {
  const { rows } = await db.query(
    `INSERT INTO orders ("orderNumber", "customerId", "boxCount", status, "assignedRiderId", "deliverySequence")
     VALUES ('FAR-OPT', $1, 2, 'assigned', 1, 1) RETURNING id`,
    [farCustomerId]
  );
  const farOrderId = rows[0].id;
  const total = (await db.query('SELECT COUNT(*)::int AS n FROM orders')).rows[0].n;

  const { status, body } = await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin);
  assert.equal(status, 200);
  const skipped = body.summary.outOfRangeOrders;
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].orderId, farOrderId);
  assert.equal(skipped[0].orderNumber, 'FAR-OPT');
  assert.ok(skipped[0].distanceKm > 3);
  assert.equal(body.summary.totalOrders, total - 1);

  const routed = body.routes.flatMap((r: any) => r.orders.map((o: any) => o.id));
  assert.ok(!routed.includes(farOrderId), 'far order must not be given to a rider');
  const farRow = await db.query('SELECT status, "assignedRiderId" FROM orders WHERE id = $1', [farOrderId]);
  assert.equal(farRow.rows[0].status, 'pending');
  assert.equal(farRow.rows[0].assignedRiderId, null);
  const sequence = await db.query('SELECT "deliverySequence" FROM orders WHERE id = $1', [farOrderId]);
  assert.equal(sequence.rows[0].deliverySequence, null);
});
