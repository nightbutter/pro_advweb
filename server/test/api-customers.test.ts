/**
 * CRUD + API integration tests for /api/customers against a disposable
 * embedded Postgres with the real seeded app (admin JWT required).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'apicust';
let base: string;
let db: Client;
let admin: string;

before(async () => {
  const booted = await bootPg(TAG, 56120);
  const url = await createDb(booted, 'apicust_t');
  base = await startApp(url, 3310); // seeds 13 riders / 60 customers / 30 orders / 14 users
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0); // app server + pool keep handles open; subprocess must exit
});

test('GET /customers returns seeded list, id DESC', async () => {
  const { status, body, contentType } = await req(base, 'GET', '/customers', undefined, admin);
  assert.equal(status, 200);
  assert.match(contentType ?? '', /application\/json/);
  assert.equal(body.length, 60);
  assert.ok(body[0].id > body[body.length - 1].id, 'expected id DESC ordering');
  for (const key of ['id', 'name', 'phone', 'address', 'lat', 'lng', 'zone']) {
    assert.ok(key in body[0], `missing key ${key}`);
  }
  assert.equal(typeof body[0].lat, 'number');
});

test('GET /customers/:id existing', async () => {
  const { status, body } = await req(base, 'GET', '/customers/1', undefined, admin);
  assert.equal(status, 200);
  assert.equal(body.id, 1);
  assert.ok(body.name.length > 0);
});

test('GET /customers/:id nonexistent -> 404', async () => {
  const { status, body } = await req(base, 'GET', '/customers/99999', undefined, admin);
  assert.equal(status, 404);
  assert.equal(body.error, 'Customer not found');
});

test('GET /customers/abc (non-integer) -> 404 not 500', async () => {
  const { status } = await req(base, 'GET', '/customers/abc', undefined, admin);
  assert.equal(status, 404);
});

test('POST /customers valid -> 201 with generated id + inferred zone', async () => {
  const payload = { name: 'ทดสอบ Unicode', phone: '080-111-2222', address: 'ที่อยู่ ทดสอบ ขามเรียง', lat: 16.251, lng: 103.251 };
  const { status, body } = await req(base, 'POST', '/customers', payload, admin);
  assert.equal(status, 201);
  assert.equal(typeof body.id, 'number');
  assert.equal(body.name, payload.name, 'unicode round-trip failed');
  assert.equal(body.lat, 16.251);
  assert.ok(body.zone, 'zone should be inferred/stored');
  const check = await db.query('SELECT * FROM customers WHERE id=$1', [body.id]);
  assert.equal(check.rows[0].name, payload.name);
});

test('POST /customers invalid zone -> 400', async () => {
  const { status } = await req(base, 'POST', '/customers', {
    name: 'x', phone: 'p', address: 'a', lat: 1, lng: 2, zone: 'ไม่มีโซนนี้'
  }, admin);
  assert.equal(status, 400);
});

test('POST /customers missing field -> 400', async () => {
  const { status, body } = await req(base, 'POST', '/customers', { name: 'x' }, admin);
  assert.equal(status, 400);
  assert.match(body.error, /missing|invalid/i);
});

test('PUT /customers/:id full body -> 200 updated', async () => {
  const created = (await req(base, 'POST', '/customers', { name: 'A', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  const { status, body } = await req(base, 'PUT', `/customers/${created.id}`, {
    name: 'A2', phone: 'P2', address: 'Addr2', lat: 16.3, lng: 103.3
  }, admin);
  assert.equal(status, 200);
  assert.equal(body.name, 'A2');
  assert.equal(body.lat, 16.3);
});

test('PUT /customers/:id nonexistent -> 404', async () => {
  const { status } = await req(base, 'PUT', '/customers/99999', {
    name: 'x', phone: 'p', address: 'a', lat: 1, lng: 2
  }, admin);
  assert.equal(status, 404);
});

test('PUT /customers/:id partial body -> 400, row unchanged', async () => {
  const created = (await req(base, 'POST', '/customers', { name: 'B', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  const { status } = await req(base, 'PUT', `/customers/${created.id}`, { name: 'only-name' }, admin);
  assert.equal(status, 400);
  const row = (await db.query('SELECT * FROM customers WHERE id=$1', [created.id])).rows[0];
  assert.equal(row.name, 'B', 'invalid request modified the row');
});

test('PUT /customers/:id validation matrix -> 400 without touching the row', async () => {
  const created = (await req(base, 'POST', '/customers', { name: 'M', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  const bad = [
    {},                                                    // empty body
    { phone: 'p', address: 'a', lat: 1, lng: 2 },          // missing name
    { name: 'n', address: 'a', lat: 1, lng: 2 },           // missing phone
    { name: 'n', phone: 'p', lat: 1, lng: 2 },             // missing address
    { name: 'n', phone: 'p', address: 'a', lng: 2 },       // missing lat
    { name: 'n', phone: 'p', address: 'a', lat: 1 },       // missing lng
    { name: null, phone: 'p', address: 'a', lat: 1, lng: 2 },          // null
    { name: '', phone: 'p', address: 'a', lat: 1, lng: 2 },            // empty string
    { name: 'n', phone: 'p', address: 'a', lat: 'abc', lng: 2 },       // wrong type
    { name: 'n', phone: 'p', address: 'a', lat: 1, lng: 'x' },         // wrong type
  ];
  for (const [i, body] of bad.entries()) {
    const { status } = await req(base, 'PUT', `/customers/${created.id}`, body, admin);
    assert.equal(status, 400, `case ${i} expected 400, got ${status}: ${JSON.stringify(body)}`);
  }
  const row = (await db.query('SELECT * FROM customers WHERE id=$1', [created.id])).rows[0];
  assert.equal(row.name, 'M', 'invalid requests modified the row');
});

test('DELETE /customers/:id without orders -> 200', async () => {
  const created = (await req(base, 'POST', '/customers', { name: 'C', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  const { status, body } = await req(base, 'DELETE', `/customers/${created.id}`, undefined, admin);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM customers WHERE id=$1', [created.id])).rows[0].c, 0);
});

test('DELETE /customers/:id with orders -> cascade removes orders', async () => {
  const cust = (await req(base, 'POST', '/customers', { name: 'D', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  const ord = (await req(base, 'POST', '/orders', { customerId: cust.id, boxCount: 2 }, admin)).body;
  const { status } = await req(base, 'DELETE', `/customers/${cust.id}`, undefined, admin);
  assert.equal(status, 200);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM customers WHERE id=$1', [cust.id])).rows[0].c, 0);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM orders WHERE id=$1', [ord.id])).rows[0].c, 0, 'order not cascaded');
});

test('DELETE /customers/:id twice -> second is 404', async () => {
  const cust = (await req(base, 'POST', '/customers', { name: 'E', phone: 'P', address: 'Addr', lat: 16.2, lng: 103.2 }, admin)).body;
  await req(base, 'DELETE', `/customers/${cust.id}`, undefined, admin);
  const { status } = await req(base, 'DELETE', `/customers/${cust.id}`, undefined, admin);
  assert.equal(status, 404);
});
