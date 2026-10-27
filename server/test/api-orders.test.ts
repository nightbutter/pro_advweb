/**
 * CRUD + API integration tests for /api/orders (incl. simulate + clear).
 * Admin JWT required — seeded DB has 30 orders.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'apiorders';
let base: string;
let db: Client;
let admin: string;

before(async () => {
  const booted = await bootPg(TAG, 56130);
  const url = await createDb(booted, 'apiorders_t');
  base = await startApp(url, 3320);
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0);
});

test('GET /orders returns seeded 30 with customer join fields', async () => {
  const { status, body } = await req(base, 'GET', '/orders', undefined, admin);
  assert.equal(status, 200);
  assert.equal(body.length, 30);
  for (const key of ['id', 'orderNumber', 'customerId', 'boxCount', 'orderTime', 'status', 'assignedRiderId', 'deliverySequence', 'customerName', 'customerPhone', 'customerAddress', 'zone', 'lat', 'lng']) {
    assert.ok(key in body[0], `missing join key ${key}`);
  }
  assert.equal(body[0].status, 'pending');
  assert.equal(body[0].orderTime, '10:15:00');
});

test('POST /orders valid -> 201, pending, HH:MM:SS orderTime, unique number', async () => {
  const { status, body } = await req(base, 'POST', '/orders', { customerId: 1, boxCount: 2 }, admin);
  assert.equal(status, 201);
  assert.equal(typeof body.id, 'number');
  assert.equal(body.status, 'pending');
  assert.match(body.orderTime, /^\d{2}:\d{2}:\d{2}$/);
  assert.match(body.orderNumber, /^ORD-\d+-\d+$/);
  assert.equal(body.customerName.length > 0, true, 'join fields missing');
  // stored row matches
  const row = (await db.query('SELECT * FROM orders WHERE id=$1', [body.id])).rows[0];
  assert.equal(row.customerId, 1);
  assert.equal(row.boxCount, 2);
});

test('created orderNumbers are unique across sequential creates', async () => {
  const a = (await req(base, 'POST', '/orders', { customerId: 2, boxCount: 1 }, admin)).body;
  const b = (await req(base, 'POST', '/orders', { customerId: 2, boxCount: 1 }, admin)).body;
  assert.notEqual(a.orderNumber, b.orderNumber);
});

test('POST /orders boxCount 0 and 4 -> 400', async () => {
  for (const bc of [0, 4]) {
    const { status } = await req(base, 'POST', '/orders', { customerId: 1, boxCount: bc }, admin);
    assert.equal(status, 400, `boxCount ${bc} should be 400`);
  }
});

test('POST /orders nonexistent customerId -> 400 (FK enforced)', async () => {
  const { status, body } = await req(base, 'POST', '/orders', { customerId: 999999, boxCount: 1 }, admin);
  assert.equal(status, 400);
  assert.match(body.error, /customerId/i);
});

test('PUT /orders/:id updates boxCount and customerId', async () => {
  const created = (await req(base, 'POST', '/orders', { customerId: 1, boxCount: 1 }, admin)).body;
  const { status, body } = await req(base, 'PUT', `/orders/${created.id}`, { boxCount: 3, customerId: 3 }, admin);
  assert.equal(status, 200);
  assert.equal(body.boxCount, 3);
  assert.equal(body.customerId, 3);
  assert.equal(body.customerName.length > 0, true);
});

test('PUT /orders/:id invalid boxCount -> 400; nonexistent -> 404; non-integer -> 404', async () => {
  const created = (await req(base, 'POST', '/orders', { customerId: 1, boxCount: 1 }, admin)).body;
  assert.equal((await req(base, 'PUT', `/orders/${created.id}`, { boxCount: 9 }, admin)).status, 400);
  assert.equal((await req(base, 'PUT', '/orders/99999', { boxCount: 1 }, admin)).status, 404);
  assert.equal((await req(base, 'PUT', '/orders/xyz', { boxCount: 1 }, admin)).status, 404);
});

test('PUT /orders/:id bogus customerId -> 400', async () => {
  const created = (await req(base, 'POST', '/orders', { customerId: 1, boxCount: 1 }, admin)).body;
  const { status } = await req(base, 'PUT', `/orders/${created.id}`, { customerId: 999999 }, admin);
  assert.equal(status, 400);
});

test('DELETE /orders/:id existing -> 200, row gone; repeat -> 404; non-integer -> 404', async () => {
  const created = (await req(base, 'POST', '/orders', { customerId: 1, boxCount: 1 }, admin)).body;
  assert.equal((await req(base, 'DELETE', `/orders/${created.id}`, undefined, admin)).status, 200);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM orders WHERE id=$1', [created.id])).rows[0].c, 0);
  assert.equal((await req(base, 'DELETE', `/orders/${created.id}`, undefined, admin)).status, 404);
  assert.equal((await req(base, 'DELETE', '/orders/xyz', undefined, admin)).status, 404);
});

test('POST /orders/simulate replaces all orders atomically', async () => {
  const { status, body } = await req(base, 'POST', '/orders/simulate', { count: 30 }, admin);
  assert.equal(status, 200);
  assert.equal(body.orders.length, 30);
  const nums = new Set(body.orders.map((o: any) => o.orderNumber));
  assert.equal(nums.size, 30, 'duplicate simulated orderNumbers');
  assert.ok(body.orders.every((o: any) => o.orderNumber.startsWith('ORD-LUNCH-')));
  assert.ok(body.orders.every((o: any) => o.status === 'pending'));
  assert.ok(body.orders.every((o: any) => /^1[01]:\d{2}:00$/.test(o.orderTime)), 'orderTime outside 10:00-10:59');
  assert.ok(body.orders.every((o: any) => o.boxCount >= 1 && o.boxCount <= 3));
  const dbCount = (await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c;
  assert.equal(dbCount, 30, 'DB count does not match simulated count — non-atomic?');
});

test('POST /orders/simulate without count -> random 28-35 orders', async () => {
  const { status, body } = await req(base, 'POST', '/orders/simulate', {}, admin);
  assert.equal(status, 200);
  assert.ok(body.orders.length >= 28 && body.orders.length <= 35,
    `expected 28-35 random orders, got ${body.orders.length}`);
});

test('DELETE /orders clears all', async () => {
  const { status } = await req(base, 'DELETE', '/orders', undefined, admin);
  assert.equal(status, 200);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c, 0);
});
