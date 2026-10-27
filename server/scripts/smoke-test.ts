/**
 * Local smoke test: boots an embedded PostgreSQL instance (no Postgres
 * install needed), runs the schema setup, starts the Express app and
 * exercises the main endpoints (login + admin JWT).
 *
 *   npm run test:smoke
 */
import path from 'path';
import fs from 'fs';
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';

const PORT = 55433;
const APP_PORT = 3300;
const dataDir = path.resolve(__dirname, '../.embedded-pg');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (msg) => console.error('[pg]', msg)
  });

  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('riderdb');
  console.log('embedded postgres up on port', PORT);

  const databaseUrl = `postgres://postgres:postgres@localhost:${PORT}/riderdb?sslmode=disable`;
  process.env.DATABASE_URL = databaseUrl;
  process.env.PORT = String(APP_PORT);

  // Verify migrations apply cleanly first (schema_migrations tracking).
  const mig = new Client({ connectionString: databaseUrl, ssl: false });
  await mig.connect();
  const migrationsDir = path.resolve(__dirname, '../migrations');
  await mig.query('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  for (const f of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await mig.query(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
    await mig.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
    console.log('applied migration', f);
  }
  await mig.end();

  // Import the app after env vars are set; it listens on PORT automatically.
  const { pool } = await import('../dbconnect');
  await import('../server');

  const base = `http://localhost:${APP_PORT}/api`;
  // The server only listens after initDatabase() finishes (schema + seeds +
  // password hashing take a few seconds on embedded PG) — poll until up.
  let health: any = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) { health = await r.json(); break; }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  let failures = 0;
  const check = (name: string, cond: boolean, extra?: any) => {
    if (cond) console.log(`PASS ${name}`);
    else { failures++; console.log(`FAIL ${name}`, extra ?? ''); }
  };

  check('health', health?.status === 'ok');

  // JWT login -> admin token for protected endpoints
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin1234' })
  });
  const loginBody = await loginRes.json();
  check('admin login', loginRes.status === 200 && typeof loginBody.token === 'string', loginBody);
  const authed = { Authorization: `Bearer ${loginBody.token}` };
  const jsonAuthed = { 'Content-Type': 'application/json', ...authed };
  const getJson = async (p: string) => (await fetch(`${base}${p}`, { headers: authed })).json();

  // unauthenticated access must be rejected
  const noAuth = await fetch(`${base}/customers`);
  check('customers requires auth (401)', noAuth.status === 401, noAuth.status);

  const customers = await getJson('/customers');
  check('customers seeded (60)', Array.isArray(customers) && customers.length === 60, customers.length);
  check('customer camelCase fields', customers[0].name !== undefined && typeof customers[0].lat === 'number');
  check('customer zone field', ['ขามเรียง', 'ท่าขอนยาง', 'หน้าป้าย'].includes(customers[0].zone), customers[0].zone);

  const riders = await getJson('/riders');
  check('riders seeded (13)', Array.isArray(riders) && riders.length === 13, riders.length);

  const rider1 = await getJson('/riders/TASK-01');
  check('rider by job code', rider1.id === 1);

  const orders = await getJson('/orders');
  check('orders seeded (30)', Array.isArray(orders) && orders.length === 30, orders.length);
  check('order join fields', orders[0].customerName !== undefined && orders[0].orderNumber !== undefined);
  check('order zone field', orders[0].zone !== undefined);

  // CRUD
  const created = await (await fetch(`${base}/customers`, {
    method: 'POST', headers: jsonAuthed,
    body: JSON.stringify({ name: 'Test Customer', phone: '080-000-0000', address: 'Somewhere', lat: 16.25, lng: 103.25 })
  })).json();
  check('create customer 201 + id', typeof created.id === 'number', created);
  check('created customer zone inferred', typeof created.zone === 'string' && created.zone.length > 0, created.zone);

  const updated = await (await fetch(`${base}/customers/${created.id}`, {
    method: 'PUT', headers: jsonAuthed,
    body: JSON.stringify({ name: 'Test Customer 2', phone: '080-000-0001', address: 'Elsewhere', lat: 16.26, lng: 103.26 })
  })).json();
  check('update customer', updated.name === 'Test Customer 2' && updated.lat === 16.26, updated);

  const newOrder = await (await fetch(`${base}/orders`, {
    method: 'POST', headers: jsonAuthed,
    body: JSON.stringify({ customerId: created.id, boxCount: 2 })
  })).json();
  check('create order', typeof newOrder.id === 'number' && newOrder.customerName === 'Test Customer 2', newOrder);

  const badOrder = await fetch(`${base}/orders`, {
    method: 'POST', headers: jsonAuthed,
    body: JSON.stringify({ customerId: created.id, boxCount: 9 })
  });
  check('boxCount validation 400', badOrder.status === 400);

  // Route optimization persists assignments
  const plan = await (await fetch(`${base}/routes/optimize`, {
    method: 'POST', headers: jsonAuthed, body: JSON.stringify({ seed: 0 })
  })).json();
  check('optimize returns routes+summary', Array.isArray(plan.routes) && plan.summary.totalOrders === 31, plan.summary);

  const ordersAfter = await getJson('/orders');
  const assigned = ordersAfter.filter((o: any) => o.status === 'assigned' && o.assignedRiderId !== null);
  check('assignments persisted', assigned.length === 31, assigned.length);

  const riderJob = await getJson('/routes/rider/1');
  check('rider route view', riderJob.route && riderJob.route.riderId === 1, riderJob);

  // Rider token cannot reach admin endpoints
  const riderLogin = await (await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rider01', password: 'rider1234' })
  })).json();
  const riderForbidden = await fetch(`${base}/customers`, {
    headers: { Authorization: `Bearer ${riderLogin.token}` }
  });
  check('rider token blocked from /customers (403)', riderForbidden.status === 403, riderForbidden.status);

  // Simulate regenerates orders atomically
  const sim = await (await fetch(`${base}/orders/simulate`, {
    method: 'POST', headers: jsonAuthed, body: JSON.stringify({ count: 30 })
  })).json();
  check('simulate 30 orders', Array.isArray(sim.orders) && sim.orders.length === 30, sim.message);

  // DELETE customer cascades orders (inside transaction)
  const del = await (await fetch(`${base}/customers/${created.id}`, { method: 'DELETE', headers: authed })).json();
  check('delete customer', del.success === true, del);

  const finalOrders = await getJson('/orders');
  check('orders of deleted customer removed', !finalOrders.some((o: any) => o.customerId === created.id));

  await pool.end();
  await pg.stop();
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke test error:', err);
  process.exit(1);
});
