/**
 * Transaction & rollback tests — verifies persisted state after failures,
 * using BEFORE-trigger failure injection through the real API paths.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, startApp, req, login } from './helpers';
import type { Client } from 'pg';

const TAG = 'txn';
let base: string;
let db: Client;
let conn: typeof import('../dbconnect');
let admin: string;

before(async () => {
  const booted = await bootPg(TAG, 56150);
  const url = await createDb(booted, 'txn_t');
  base = await startApp(url, 3340);
  admin = await login(base, 'admin', 'admin1234');
  db = await connectDb(url);
  conn = await import('../dbconnect');
});

after(async () => {
  await db.end();
  try { await conn.pool.end(); } catch {}
  await shutdownPg(TAG);
  process.exit(0);
});

async function installTrigger(table: string, name: string, when: string) {
  await db.query(`
    CREATE OR REPLACE FUNCTION fail_trigger() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'injected test failure'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER ${name} BEFORE ${when} ON ${table}
    FOR EACH ROW EXECUTE FUNCTION fail_trigger();
  `);
}
async function dropTrigger(table: string, name: string) {
  await db.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
}

// --- direct transaction() helper ---

test('transaction() commits all writes on success', async () => {
  const n = await conn.transaction(async (client) => {
    const a = await client.query(
      `INSERT INTO customers (name,phone,address,lat,lng) VALUES ('TX1','p','a',1,1) RETURNING id`
    );
    await client.query(
      `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-TX-1',$1,1)`,
      [a.rows[0].id]
    );
    return a.rows[0].id;
  });
  assert.equal(typeof n, 'number');
  assert.equal((await db.query(`SELECT COUNT(*)::int c FROM orders WHERE "orderNumber"='ORD-TX-1'`)).rows[0].c, 1);
  await db.query(`DELETE FROM orders WHERE "orderNumber"='ORD-TX-1'`);
  await db.query(`DELETE FROM customers WHERE name='TX1'`);
});

test('transaction() rolls back earlier writes when a later statement fails', async () => {
  await assert.rejects(
    conn.transaction(async (client) => {
      await client.query(
        `INSERT INTO customers (name,phone,address,lat,lng) VALUES ('TX2','p','a',1,1)`
      );
      throw new Error('boom');
    })
  );
  assert.equal(
    (await db.query(`SELECT COUNT(*)::int c FROM customers WHERE name='TX2'`)).rows[0].c,
    0,
    'rolled-back insert is visible — transaction broken'
  );
});

test('pool remains usable after a failed transaction', async () => {
  await assert.rejects(conn.transaction(async () => { throw new Error('boom'); }));
  const { rows } = await conn.query('SELECT 1 AS ok');
  assert.equal(rows[0].ok, 1);
});

// --- rollback through real API paths (trigger-injected failures) ---

test('customer delete: failure AFTER deleting orders rolls back the order delete', async () => {
  const cust = (await req(base, 'POST', '/customers', { name: 'TDel', phone: 'p', address: 'a', lat: 16.2, lng: 103.2 }, admin)).body;
  const ord = (await req(base, 'POST', '/orders', { customerId: cust.id, boxCount: 1 }, admin)).body;

  await installTrigger('customers', 'trg_fail_cust_del', 'DELETE');
  try {
    const { status } = await req(base, 'DELETE', `/customers/${cust.id}`, undefined, admin);
    assert.equal(status, 500);
  } finally {
    await dropTrigger('customers', 'trg_fail_cust_del');
  }

  // If rollback failed, the order would already be gone.
  const stillThere = (await db.query('SELECT COUNT(*)::int c FROM orders WHERE id=$1', [ord.id])).rows[0].c;
  assert.equal(stillThere, 1, 'order was deleted even though customer delete failed — NOT atomic');
  // now succeeds
  assert.equal((await req(base, 'DELETE', `/customers/${cust.id}`, undefined, admin)).status, 200);
});

test('simulate: mid-batch INSERT failure restores previous orders', async () => {
  // give the DB a known pre-state
  const pre = (await req(base, 'GET', '/orders', undefined, admin)).body;
  const preNums = pre.map((o: any) => o.orderNumber).sort();

  // fail when the 5th simulated order is inserted
  await db.query(`
    CREATE OR REPLACE FUNCTION fail_sim() RETURNS trigger AS $$
    BEGIN IF NEW."orderNumber"='ORD-LUNCH-005' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_fail_sim BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION fail_sim();
  `);
  let status = 0;
  try {
    status = (await req(base, 'POST', '/orders/simulate', { count: 10 }, admin)).status;
  } finally {
    await db.query('DROP TRIGGER IF EXISTS trg_fail_sim ON orders');
  }
  assert.equal(status, 500);

  const post = (await req(base, 'GET', '/orders', undefined, admin)).body;
  assert.deepEqual(
    post.map((o: any) => o.orderNumber).sort(),
    preNums,
    'simulate was not atomic — partial insert visible after failure'
  );
});

test('optimize: failure during assignment update rolls back all updates', async () => {
  await db.query(`
    CREATE OR REPLACE FUNCTION fail_opt() RETURNS trigger AS $$
    BEGIN IF NEW."deliverySequence"=2 THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER trg_fail_opt BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_opt();
  `);
  let status = 0;
  try {
    status = (await req(base, 'POST', '/routes/optimize', { seed: 0 }, admin)).status;
  } finally {
    await db.query('DROP TRIGGER IF EXISTS trg_fail_opt ON orders');
  }
  assert.equal(status, 500);
  const pending = (await db.query(`SELECT COUNT(*)::int c FROM orders WHERE status='pending'`)).rows[0].c;
  const total = (await db.query(`SELECT COUNT(*)::int c FROM orders`)).rows[0].c;
  assert.equal(pending, total, 'partial assignment persisted — optimize not atomic');
});
