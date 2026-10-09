// API regression tests — run with `npm test` (builds first).
// Uses an isolated ephemeral DB (VERCEL=1 -> os.tmpdir()) so no dev/prod data is touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.VERCEL = '1'; // must be set before importing the app

let server;
let base;

before(async () => {
  const require = createRequire(import.meta.url);
  const app = require('../dist/index.js').default;
  server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

const get = async (p) => fetch(base + p);
const send = async (m, p, body) =>
  fetch(base + p, {
    method: m,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

test('health returns ok with storage flag', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, 'ok');
});

test('customers: list, get, 404s', async () => {
  assert.equal((await get('/customers')).status, 200);
  assert.equal((await get('/customers/1')).status, 200);
  assert.equal((await get('/customers/9999')).status, 404);
  assert.equal((await get('/customers/abc')).status, 404);
});

test('customers/search: partial match, missing q -> 400, LIKE escaping', async () => {
  const res = await get('/customers/search?q=' + encodeURIComponent('หอพัก'));
  assert.equal(res.status, 200);
  assert.ok((await res.json()).length > 0);
  assert.equal((await get('/customers/search')).status, 400);
  const esc = await get('/customers/search?q=%25'); // literal %
  assert.deepEqual(await esc.json(), []);
});

test('customers/nearby: default 1km, validation, empty result', async () => {
  const res = await get('/customers/nearby?lat=16.2465&lng=103.2505');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.radiusMeters, 1000);
  assert.ok(j.count > 0 && j.count === j.customers.length);
  assert.ok(j.customers.every(c => c.distanceMeters <= 1000));
  assert.equal((await get('/customers/nearby?lat=999&lng=103')).status, 400);
  assert.equal((await get('/customers/nearby?lat=16.2&lng=103.2&radius=-1')).status, 400);
  // radiusKm whitelist (HW-5 configurable radius)
  for (const km of [0.5, 1, 2, 3, 5, 10]) {
    const r = await get(`/customers/nearby?lat=16.2465&lng=103.2505&radiusKm=${km}`);
    assert.equal(r.status, 200, `radiusKm=${km}`);
    assert.equal((await r.json()).radiusMeters, km * 1000);
  }
  assert.equal((await get('/customers/nearby?lat=16.2465&lng=103.2505&radiusKm=7')).status, 400);
  assert.equal((await get('/customers/nearby?lat=16.2465&lng=103.2505&radiusKm=abc')).status, 400);
  const far = await (await get('/customers/nearby?lat=0&lng=0')).json();
  assert.equal(far.count, 0);
});

test('customers: create/update/delete lifecycle and validation', async () => {
  const created = await (await send('POST', '/customers', {
    name: 'Test', phone: '080', address: 't', lat: 16.2, lng: 103.2
  })).json();
  assert.ok(created.id > 0);
  assert.equal((await send('POST', '/customers', { name: 'x' })).status, 400);
  assert.equal((await send('POST', '/customers', {
    name: 'x', phone: '1', address: 'a', lat: 999, lng: 0
  })).status, 400);
  assert.equal((await send('PUT', `/customers/${created.id}`, {
    name: 'U', phone: '1', address: 'a', lat: 16.3, lng: 103.3
  })).status, 200);
  assert.equal((await send('PUT', `/customers/${created.id}`, { name: 'only' })).status, 400);
  assert.equal((await send('PUT', '/customers/9999', {
    name: 'U', phone: '1', address: 'a', lat: 16.3, lng: 103.3
  })).status, 404);
  assert.equal((await send('DELETE', `/customers/${created.id}`)).status, 200);
  assert.equal((await send('DELETE', `/customers/${created.id}`)).status, 404);
});

test('orders: create/update/delete lifecycle and validation', async () => {
  const created = await (await send('POST', '/orders', { customerId: 1, boxCount: 2 })).json();
  assert.ok(created.id > 0 && created.customerName);
  for (const body of [
    { customerId: 1, boxCount: 0 },
    { customerId: 1, boxCount: 4 },
    { customerId: 1, boxCount: 2.5 },
    { customerId: 9999, boxCount: 1 },
    { customerId: 'abc', boxCount: 1 },
    {}
  ]) assert.equal((await send('POST', '/orders', body)).status, 400, JSON.stringify(body));

  assert.equal((await send('PUT', `/orders/${created.id}`, { boxCount: 3 })).status, 200);
  assert.equal((await send('PUT', `/orders/${created.id}`, { customerId: 9999 })).status, 400);
  assert.equal((await send('PUT', '/orders/9999', { boxCount: 2 })).status, 404);
  assert.equal((await send('DELETE', `/orders/${created.id}`)).status, 200);
});

test('orders/nearby: default 2km via customer coords', async () => {
  const res = await get('/orders/nearby?lat=16.2465&lng=103.2505');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.radiusMeters, 2000);
  assert.ok(j.orders.every(o => o.distanceMeters <= 2000));
  assert.equal((await get('/orders/nearby?lat=16&lng=999')).status, 400);
});

test('orders/nearby: radiusKm whitelist and backward-compat meters param', async () => {
  const km = await (await get('/orders/nearby?lat=16.2465&lng=103.2505&radiusKm=5')).json();
  assert.equal(km.radiusMeters, 5000);
  assert.ok(km.orders.every(o => o.distanceMeters <= 5000));
  assert.equal((await get('/orders/nearby?lat=16.2465&lng=103.2505&radiusKm=4')).status, 400);
  // legacy meters param still works
  const m = await (await get('/orders/nearby?lat=16.2465&lng=103.2505&radius=1500')).json();
  assert.equal(m.radiusMeters, 1500);
});

test('nearby: smaller radiusKm returns a subset of the default', async () => {
  const small = await (await get('/customers/nearby?lat=16.2465&lng=103.2505&radiusKm=0.5')).json();
  const big = await (await get('/customers/nearby?lat=16.2465&lng=103.2505&radiusKm=2')).json();
  assert.ok(small.count <= big.count);
  assert.ok(small.customers.every(c => c.distanceMeters <= 500));
});

test('orders/simulate rejects invalid count without wiping orders (regression: count=-5)', async () => {
  const before = (await (await get('/orders')).json()).length;
  for (const bad of [-5, 0, 1.5, 'abc', 501]) {
    assert.equal((await send('POST', '/orders/simulate', { count: bad })).status, 400, `count=${bad}`);
  }
  const afterCount = (await (await get('/orders')).json()).length;
  assert.equal(afterCount, before);
  assert.equal((await send('POST', '/orders/simulate', { count: 5 })).status, 200);
});

test('riders: list and lookup by id/job code', async () => {
  assert.equal((await (await get('/riders')).json()).length, 13);
  assert.equal((await get('/riders/1')).status, 200);
  assert.equal((await get('/riders/TASK-01')).status, 200);
  assert.equal((await get('/riders/99')).status, 404);
  assert.equal((await get('/riders/abc')).status, 404);
});

test('routes: optimize, current, rider route', async () => {
  assert.equal((await send('POST', '/routes/optimize', { seed: 0 })).status, 200);
  const cur = await (await get('/routes/current')).json();
  assert.ok(Array.isArray(cur.routes) && cur.summary && cur.shopLocation);
  assert.equal((await get('/routes/rider/abc')).status, 404);
});

test('error contract: JSON errors, no HTML/stack leaks', async () => {
  // malformed JSON body -> JSON 400, not HTML error page
  const bad = await fetch(base + '/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad'
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await bad.json(), { error: 'Malformed request body' });

  // unknown API path -> JSON 404
  const nf = await get('/nonexistent');
  assert.equal(nf.status, 404);
  assert.equal(nf.headers.get('content-type'), 'application/json; charset=utf-8');
});
