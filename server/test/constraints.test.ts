/**
 * Database-enforced constraint tests — direct SQL bypassing Express validation.
 * Also documents intentional schema gaps (no FK on assignedRiderId, free-form
 * status/orderTime) as characterized behavior, not silently fixed.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, runScript } from './helpers';
import type { Client } from 'pg';

const TAG = 'constraints';
let db: Client;
let customerId: number;

before(async () => {
  const booted = await bootPg(TAG, 56110);
  const url = await createDb(booted, 'constraints_t');
  const res = await runScript('scripts/migrate.ts', {
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url
  });
  assert.equal(res.code, 0, `migrate failed: ${res.stderr}`);
  db = await connectDb(url);
  const c = await db.query(
    `INSERT INTO customers (name, phone, address, lat, lng) VALUES ('T','P','A',1.0,2.0) RETURNING id`
  );
  customerId = c.rows[0].id;
  await db.query(`INSERT INTO riders (id, name, phone, color, "maxOrders", status) VALUES (1,'R','P','#fff',3,'active')`);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
});

async function expectPgError(promise: Promise<unknown>, code: string, constraintRe?: RegExp) {
  try {
    await promise;
  } catch (e: any) {
    assert.equal(e.code, code, `expected SQLSTATE ${code}, got ${e.code}: ${e.message}`);
    if (constraintRe) assert.match(e.constraint ?? '', constraintRe);
    return;
  }
  assert.fail(`expected SQLSTATE ${code} but statement succeeded`);
}

test('valid records accepted (control)', async () => {
  const r = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount","orderTime",status)
     VALUES ('ORD-T-001',$1,2,'10:00:00','pending') RETURNING id`,
    [customerId]
  );
  assert.equal(typeof r.rows[0].id, 'number');
});

test('duplicate orderNumber rejected (23505, unique constraint)', async () => {
  await expectPgError(
    db.query(
      `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-T-001',$1,1)`,
      [customerId]
    ),
    '23505',
    /orderNumber/i
  );
});

test('boxCount out of range rejected (23514 CHECK)', async () => {
  for (const bad of [0, 4, -1, 99]) {
    await expectPgError(
      db.query(
        `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ($1,$2,$3)`,
        [`ORD-T-BC-${bad}`, customerId, bad]
      ),
      '23514',
      /boxCount/i
    );
  }
});

test('order referencing nonexistent customer rejected (23503 FK)', async () => {
  await expectPgError(
    db.query(
      `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-T-FK',999999,1)`
    ),
    '23503',
    /customerId/i
  );
});

test('NOT NULL violations rejected (23502)', async () => {
  await expectPgError(
    db.query(`INSERT INTO customers (phone, address, lat, lng) VALUES ('P','A',1,2)`),
    '23502'
  );
  await expectPgError(
    db.query(`INSERT INTO orders ("orderNumber","boxCount") VALUES ('ORD-T-NN',1)`),
    '23502'
  );
});

test('duplicate primary key rejected (23505)', async () => {
  await expectPgError(
    db.query(`INSERT INTO customers (id, name, phone, address, lat, lng) VALUES ($1,'N','P','A',1,2)`, [customerId]),
    '23505'
  );
});

test('FK blocks deleting a customer that still has orders (23503)', async () => {
  await expectPgError(db.query(`DELETE FROM customers WHERE id=$1`, [customerId]), '23503');
});

test('failed INSERT leaves no partial row', async () => {
  const before = (await db.query(`SELECT COUNT(*)::int c FROM orders`)).rows[0].c;
  await expectPgError(
    db.query(`INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-T-001',$1,1)`, [customerId]),
    '23505'
  );
  const after = (await db.query(`SELECT COUNT(*)::int c FROM orders`)).rows[0].c;
  assert.equal(after, before);
});

// --- Documented intentional gaps (characterization, NOT correctness proof) ---

test('GAP: assignedRiderId has no FK — orphan rider ids are accepted', async () => {
  const r = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount","assignedRiderId")
     VALUES ('ORD-T-GAP',$1,1,999999) RETURNING "assignedRiderId"`,
    [customerId]
  );
  assert.equal(r.rows[0].assignedRiderId, 999999, 'expected orphan insert to succeed (no FK)');
  await db.query(`DELETE FROM orders WHERE "orderNumber"='ORD-T-GAP'`);
});

test('GAP: orders.status is unconstrained TEXT — arbitrary values stored', async () => {
  const r = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount",status)
     VALUES ('ORD-T-ST',$1,1,'not-a-real-status') RETURNING status`,
    [customerId]
  );
  assert.equal(r.rows[0].status, 'not-a-real-status');
  await db.query(`DELETE FROM orders WHERE "orderNumber"='ORD-T-ST'`);
});

test('GAP: orderTime is TEXT — non-time strings stored', async () => {
  const r = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount","orderTime")
     VALUES ('ORD-T-OT',$1,1,'banana') RETURNING "orderTime"`,
    [customerId]
  );
  assert.equal(r.rows[0].orderTime, 'banana');
  await db.query(`DELETE FROM orders WHERE "orderNumber"='ORD-T-OT'`);
});

test('orderTime column default produces timestamp-like text', async () => {
  const r = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-T-DEF',$1,1) RETURNING "orderTime"`,
    [customerId]
  );
  assert.match(r.rows[0].orderTime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  await db.query(`DELETE FROM orders WHERE "orderNumber"='ORD-T-DEF'`);
});
