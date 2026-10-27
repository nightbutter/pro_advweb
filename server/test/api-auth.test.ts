/**
 * JWT auth + authorization tests: login contract, token enforcement,
 * admin-only routes, and per-rider access control.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'apiauth';
let base: string;
let db: Client;
let admin: string;
let rider1: string;

before(async () => {
  const booted = await bootPg(TAG, 56200);
  const url = await createDb(booted, 'apiauth_t');
  base = await startApp(url, 3360);
  admin = await login(base, 'admin', 'admin1234');
  rider1 = await login(base, 'rider01', 'rider1234');
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
  process.exit(0);
});

test('POST /auth/login valid admin -> 200 token + user payload', async () => {
  const { status, body } = await req(base, 'POST', '/auth/login', { username: 'admin', password: 'admin1234' });
  assert.equal(status, 200);
  assert.ok(typeof body.token === 'string' && body.token.split('.').length === 3, 'not a JWT');
  assert.equal(body.user.username, 'admin');
  assert.equal(body.user.role, 'admin');
});

test('POST /auth/login rider -> role rider bound to riderId 1', async () => {
  const { status, body } = await req(base, 'POST', '/auth/login', { username: 'rider01', password: 'rider1234' });
  assert.equal(status, 200);
  assert.equal(body.user.role, 'rider');
  assert.equal(body.user.riderId, 1);
});

test('POST /auth/login wrong password and unknown user -> identical 401 (no user probing)', async () => {
  const bad = await req(base, 'POST', '/auth/login', { username: 'admin', password: 'wrong' });
  const ghost = await req(base, 'POST', '/auth/login', { username: 'nobody', password: 'wrong' });
  assert.equal(bad.status, 401);
  assert.equal(ghost.status, 401);
  assert.deepEqual(bad.body, ghost.body, 'different messages leak which usernames exist');
});

test('POST /auth/login missing fields -> 400', async () => {
  assert.equal((await req(base, 'POST', '/auth/login', {})).status, 400);
  assert.equal((await req(base, 'POST', '/auth/login', { username: 'admin' })).status, 400);
});

test('GET / displays only a configured non-development Frontend URL in production', async () => {
  const previousFrontendUrl = process.env.FRONTEND_URL;
  const previousVercel = process.env.VERCEL;
  const rootUrl = `${base.replace(/\/api$/, '')}/`;

  try {
    process.env.VERCEL = '1';
    process.env.FRONTEND_URL = 'https://frontend.example.test/path';
    let response = await fetch(rootUrl);
    let body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.message.includes('https://frontend.example.test'));
    assert.doesNotMatch(body.message, /localhost|127\.0\.0\.1/);

    process.env.FRONTEND_URL = 'http://localhost:4200';
    response = await fetch(rootUrl);
    body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(!body.message.includes('http://localhost:4200'));
    assert.equal(body.health, '/api/health');

    delete process.env.FRONTEND_URL;
    response = await fetch(rootUrl);
    body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.message.startsWith('Smart Rider Backend'));
    assert.equal(body.health, '/api/health');

    const health = await req(base, 'GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

test('customer registration stores profile details and creates a customer-only login', async () => {
  const registration = await req(base, 'POST', '/auth/register/customer', {
    name: 'ลูกค้าทดสอบ',
    phone: '081-222-3344',
    address: 'หอพักตัวอย่าง ขามเรียง',
    username: 'customer01',
    password: 'securepass123'
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.profile.name, 'ลูกค้าทดสอบ');
  assert.equal(registration.body.profile.phone, '081-222-3344');
  assert.equal(registration.body.profile.address, 'หอพักตัวอย่าง ขามเรียง');

  const token = await login(base, 'customer01', 'securepass123');
  const me = await req(base, 'GET', '/auth/me', undefined, token);
  assert.equal(me.body.user.role, 'customer');
  assert.equal(me.body.profile.name, 'ลูกค้าทดสอบ');
  assert.equal(me.body.profile.address, 'หอพักตัวอย่าง ขามเรียง');
  assert.equal((await req(base, 'GET', '/customers', undefined, token)).status, 403);
  assert.equal((await req(base, 'GET', '/riders', undefined, token)).status, 403);
  assert.equal((await req(base, 'GET', '/routes/rider/1', undefined, token)).status, 403);
  assert.equal((await req(base, 'POST', '/auth/register/customer', {
    name: 'ลูกค้าซ้ำ',
    phone: '081-111-2233',
    address: 'ที่อยู่ซ้ำ',
    username: 'CUSTOMER01',
    password: 'securepass123'
  })).status, 409);
});

test('customer registration rejects incomplete or invalid details', async () => {
  const response = await req(base, 'POST', '/auth/register/customer', {
    name: '',
    phone: 'abc',
    address: '',
    username: 'x',
    password: 'short'
  });
  assert.equal(response.status, 400);
});

test('GET /auth/me returns the token user', async () => {
  const { status, body } = await req(base, 'GET', '/auth/me', undefined, rider1);
  assert.equal(status, 200);
  assert.equal(body.user.username, 'rider01');
});

test('protected routes without token -> 401; bogus token -> 401', async () => {
  for (const p of ['/customers', '/orders', '/riders', '/routes/current']) {
    assert.equal((await req(base, 'GET', p)).status, 401, `${p} should require auth`);
    assert.equal((await req(base, 'GET', p, undefined, 'not.a.token')).status, 401, `${p} should reject bad token`);
  }
});

test('admin-only routes: rider token -> 403', async () => {
  assert.equal((await req(base, 'GET', '/customers', undefined, rider1)).status, 403);
  assert.equal((await req(base, 'GET', '/orders', undefined, rider1)).status, 403);
  assert.equal((await req(base, 'POST', '/orders', { customerId: 1, boxCount: 1 }, rider1)).status, 403);
  assert.equal((await req(base, 'POST', '/orders/simulate', { count: 5 }, rider1)).status, 403);
  assert.equal((await req(base, 'POST', '/routes/optimize', { seed: 0 }, rider1)).status, 403);
  assert.equal((await req(base, 'GET', '/routes/current', undefined, rider1)).status, 403);
});

test('GET /riders: rider sees only own record', async () => {
  const { status, body } = await req(base, 'GET', '/riders', undefined, rider1);
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].id, 1);
});

test('GET /riders/:id: rider can read own, 403 for others', async () => {
  assert.equal((await req(base, 'GET', '/riders/1', undefined, rider1)).status, 200);
  assert.equal((await req(base, 'GET', '/riders/2', undefined, rider1)).status, 403);
  assert.equal((await req(base, 'GET', '/riders/TASK-05', undefined, rider1)).status, 403);
});

test('GET /routes/rider/:id: rider limited to own job', async () => {
  // admin builds a plan so rider 1 may have a route
  await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin);
  assert.equal((await req(base, 'GET', '/routes/rider/5', undefined, rider1)).status, 403);
  const own = await req(base, 'GET', '/routes/rider/1', undefined, rider1);
  assert.ok(own.status === 200 || own.status === 404, `expected own-route access (200) or no route (404), got ${own.status}`);
});

test('seeded users: admin + rider01..rider13 exist and can all log in', async () => {
  const users = (await db.query(`SELECT username, role, "riderId" FROM users WHERE role IN ('admin', 'rider') ORDER BY id`)).rows;
  assert.equal(users.length, 14);
  assert.equal(users[0].username, 'admin');
  for (let i = 1; i <= 13; i++) {
    const uname = `rider${i.toString().padStart(2, '0')}`;
    assert.equal(users[i].username, uname);
    assert.equal(users[i].riderId, i);
    const token = await login(base, uname, 'rider1234');
    assert.ok(token, `${uname} could not log in`);
  }
});
