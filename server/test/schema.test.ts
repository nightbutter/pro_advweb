/**
 * Schema introspection tests — verify actual PostgreSQL catalog metadata,
 * not merely that queries work. Target: database built by `npm run migrate`.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootPg, createDb, connectDb, shutdownPg, runScript } from './helpers';
import type { Client } from 'pg';

const TAG = 'schema';
let url: string;
let db: Client;

before(async () => {
  const booted = await bootPg(TAG, 56100);
  url = await createDb(booted, 'schema_t');
  // Build the schema via the real migration script (also creates _migrations)
  const res = await runScript('scripts/migrate.ts', {
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url
  });
  assert.equal(res.code, 0, `migrate failed: ${res.stderr}`);
  db = await connectDb(url);
});

after(async () => {
  await db.end();
  await shutdownPg(TAG);
});

async function columns(table: string) {
  const { rows } = await db.query(
    `SELECT column_name, data_type, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table]
  );
  return rows;
}

async function constraints(table: string, contype?: string) {
  const { rows } = await db.query(
    `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname='public' AND t.relname=$1 ${contype ? 'AND c.contype=$2' : ''}`,
    contype ? [table, contype] : [table]
  );
  return rows;
}

test('all expected tables exist', async () => {
  const { rows } = await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`
  );
  const names = rows.map((r) => r.table_name);
  for (const t of ['customers', 'orders', 'riders', 'users', '_migrations']) {
    assert.ok(names.includes(t), `missing table ${t}`);
  }
});

test('customers columns, types, nullability, identity', async () => {
  const cols = await columns('customers');
  assert.deepEqual(
    cols.map((c) => c.column_name),
    ['id', 'name', 'phone', 'address', 'lat', 'lng', 'zone']
  );
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  assert.equal(byName.id.data_type, 'integer');
  assert.equal(byName.id.is_identity, 'YES');
  assert.equal(byName.lat.data_type, 'double precision');
  assert.equal(byName.lng.data_type, 'double precision');
  for (const col of cols) assert.equal(col.is_nullable, 'NO', `${col.column_name} should be NOT NULL`);
});

test('orders columns incl. camelCase names and defaults', async () => {
  const cols = await columns('orders');
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  for (const n of ['id', 'orderNumber', 'customerId', 'boxCount', 'orderTime', 'status', 'assignedRiderId', 'deliverySequence']) {
    assert.ok(byName[n], `missing column ${n}`);
  }
  assert.equal(byName.id.is_identity, 'YES');
  assert.equal(byName.orderNumber.is_nullable, 'NO');
  assert.equal(byName.customerId.is_nullable, 'NO');
  assert.equal(byName.boxCount.is_nullable, 'NO');
  assert.equal(byName.orderTime.is_nullable, 'YES');
  assert.match(byName.orderTime.column_default ?? '', /to_char/);
  assert.equal(byName.status.column_default, `'pending'::text`);
  assert.equal(byName.assignedRiderId.is_nullable, 'YES');
  assert.equal(byName.deliverySequence.is_nullable, 'YES');
});

test('riders columns and defaults (manual PK, no identity)', async () => {
  const cols = await columns('riders');
  const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
  assert.equal(byName.id.is_identity, 'NO');
  assert.equal(byName.maxOrders.column_default, '3');
  assert.equal(byName.status.column_default, `'active'::text`);
});

test('users columns, constraints and rider FK', async () => {
  const cols = await columns('users');
  assert.deepEqual(
    cols.map((c) => c.column_name),
    ['id', 'username', 'passwordHash', 'role', 'riderId']
  );
  const uniques = await constraints('users', 'u');
  assert.ok(uniques.some((c) => c.def.includes('username')), 'no UNIQUE on users.username');
  const fks = await constraints('users', 'f');
  assert.ok(fks.some((c) => c.def.includes('REFERENCES riders(id)')), 'no FK users.riderId -> riders');
});

test('customers.zone CHECK constraint (3 delivery zones)', async () => {
  const checks = await constraints('customers', 'c');
  const chk = checks.find((c) => c.def.includes('zone'));
  assert.ok(chk, 'no CHECK on customers.zone');
  assert.match(chk.def, /ขามเรียง/);
  assert.match(chk.def, /ท่าขอนยาง/);
  assert.match(chk.def, /หน้าป้าย/);
});

test('primary keys present on all tables', async () => {
  for (const t of ['customers', 'orders', 'riders', 'users']) {
    const pks = await constraints(t, 'p');
    assert.equal(pks.length, 1, `${t} should have exactly one PK`);
  }
});

test('orders.orderNumber has UNIQUE constraint', async () => {
  const uniques = await constraints('orders', 'u');
  const match = uniques.find((c) => c.def.includes('orderNumber'));
  assert.ok(match, 'no UNIQUE constraint on orderNumber');
});

test('orders.boxCount CHECK constraint (1-3)', async () => {
  const checks = await constraints('orders', 'c');
  const chk = checks.find((c) => c.def.includes('boxCount'));
  assert.ok(chk, 'no CHECK on boxCount');
  assert.match(chk.def, /boxCount/);
  assert.match(chk.def, /1/);
  assert.match(chk.def, /3/);
});

test('orders.customerId FK references customers.id with NO ACTION delete', async () => {
  const { rows } = await db.query(`
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def,
           c.confdeltype
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='orders' AND c.contype='f'`);
  assert.equal(rows.length, 1, 'expected exactly one FK on orders');
  assert.match(rows[0].def, /FOREIGN KEY \("customerId"\) REFERENCES customers\(id\)/);
  assert.equal(rows[0].confdeltype, 'a', 'FK delete action should be NO ACTION (a)');
});

test('expected indexes exist (incl. idx_orders_*)', async () => {
  const { rows } = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' ORDER BY indexname`
  );
  const names = rows.map((r) => r.indexname);
  assert.ok(names.includes('idx_orders_customer'), 'missing idx_orders_customer');
  assert.ok(names.includes('idx_orders_rider'), 'missing idx_orders_rider');
});

test('camelCase columns require quoting (case sensitivity)', async () => {
  await assert.rejects(
    db.query('SELECT orderNumber FROM orders LIMIT 0'),
    /does not exist/i,
    'unquoted orderNumber should fail (column is "orderNumber")'
  );
  const { rows } = await db.query('SELECT "orderNumber" FROM orders LIMIT 0');
  assert.ok(rows);
});

test('_migrations records applied files', async () => {
  const { rows } = await db.query('SELECT name, applied_at FROM _migrations ORDER BY name');
  assert.deepEqual(rows.map((r) => r.name), ['001_init.sql', '002_order_number_seq.sql', '003_customer_registration.sql']);
  assert.ok(rows[0].applied_at instanceof Date);
});
