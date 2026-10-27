/**
 * Migration workflow tests: application, idempotent re-run, failed-migration
 * bookkeeping, and schema drift between migrate-script and initDatabase() DDL.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootPg, createDb, connectDb, shutdownPg, runScript, migrationsDir } from './helpers';
import type { Client } from 'pg';

const TAG = 'migrations';
let booted: Awaited<ReturnType<typeof bootPg>>;

before(async () => {
  booted = await bootPg(TAG, 56170);
});

after(async () => {
  await shutdownPg(TAG);
});

test('migrate applies 001_init.sql and records _migrations', async () => {
  const url = await createDb(booted, 'mig_a');
  const res = await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /apply 001_init\.sql/);
  assert.match(res.stdout, /apply 002_order_number_seq\.sql/);
  assert.match(res.stdout, /apply 003_customer_registration\.sql/);

  const db = await connectDb(url);
  const tables = (await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map((r) => r.table_name);
  for (const t of ['customers', 'orders', 'riders', 'customer_profiles', '_migrations']) assert.ok(tables.includes(t));
  const mig = (await db.query('SELECT name FROM _migrations ORDER BY name')).rows.map((r) => r.name);
  assert.deepEqual(mig, ['001_init.sql', '002_order_number_seq.sql', '003_customer_registration.sql']);
  await db.end();
});

test('migrate re-run skips already-applied files', async () => {
  const url = await createDb(booted, 'mig_b');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
  const res = await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /skip  001_init\.sql/);
  assert.doesNotMatch(res.stdout, /apply 001/);
});

test('failing migration is NOT recorded and its statements roll back', async () => {
  const url = await createDb(booted, 'mig_c');
  const bad = path.join(migrationsDir(), 'zzz_fail_test.sql');
  fs.writeFileSync(bad, 'CREATE TABLE boom (id int);\nTHIS IS NOT SQL;\n');
  try {
    const res = await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
    assert.notEqual(res.code, 0, 'invalid migration should fail');
    const db = await connectDb(url);
    const recorded = (await db.query('SELECT name FROM _migrations ORDER BY name')).rows.map((r) => r.name);
    assert.ok(!recorded.includes('zzz_fail_test.sql'), 'failed migration was recorded');
    assert.ok(recorded.includes('001_init.sql'), 'earlier valid migration should still apply');
    const boom = (await db.query(
      `SELECT COUNT(*)::int c FROM information_schema.tables WHERE table_schema='public' AND table_name='boom'`)).rows[0].c;
    assert.equal(boom, 0, 'partial effects of failed migration were committed');
    await db.end();
  } finally {
    fs.rmSync(bad, { force: true });
  }
});

// --- drift between migrate path and initDatabase() path ---

async function schemaFingerprint(db: Client) {
  const tables = (await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name <> '_migrations' ORDER BY 1`)).rows.map((r) => r.table_name);
  const cols = (await db.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name <> '_migrations'
     ORDER BY 1,2`)).rows;
  const cons = (await db.query(
    `SELECT t.relname AS table, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
     JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='public' AND t.relname <> '_migrations' ORDER BY 1,2`)).rows;
  const idx = (await db.query(
    `SELECT tablename, indexname FROM pg_indexes
     WHERE schemaname='public' AND tablename <> '_migrations' ORDER BY 1,2`)).rows;
  const seqs = (await db.query(
    `SELECT sequence_name FROM information_schema.sequences
     WHERE sequence_schema='public' ORDER BY 1`)).rows.map((r) => r.sequence_name);
  return { tables, cols, cons, idx, seqs };
}

test('schema built by migrate equals initDatabase() — fingerprint comparison', async () => {
  const urlM = await createDb(booted, 'drift_migrate');
  const urlI = await createDb(booted, 'drift_init');
  await runScript('scripts/migrate.ts', { DATABASE_URL: urlM, DATABASE_URL_UNPOOLED: urlM });
  const resI = await runScript('test/bin/init-db.ts', { DATABASE_URL: urlI });
  assert.equal(resI.code, 0, resI.stderr);

  const dm = await connectDb(urlM);
  const di = await connectDb(urlI);
  const fm = await schemaFingerprint(dm);
  const fi = await schemaFingerprint(di);
  await dm.end();
  await di.end();

  assert.deepEqual(fm.tables, fi.tables, 'table sets differ');
  assert.deepEqual(fm.cols, fi.cols, 'columns/types/defaults differ');
  assert.deepEqual(fm.cons, fi.cons, 'constraints differ');
  assert.deepEqual(fm.idx, fi.idx, 'indexes differ');
  assert.deepEqual(fm.seqs, fi.seqs, 'sequences differ');
});

// The runtime schema module must stay byte-equivalent (modulo comments and
// whitespace) to the canonical migration files — this is the guard that lets
// initDatabase() and `npm run migrate` share one definition.
const normalizeSql = (sql: string) =>
  sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

test('schema.ts constants match migrations/*.sql exactly', async () => {
  const { INIT_SCHEMA_SQL, ORDER_NUMBER_SEQ_SQL, CUSTOMER_REGISTRATION_SQL } = await import('../schema');
  const f001 = fs.readFileSync(path.join(migrationsDir(), '001_init.sql'), 'utf8');
  const f002 = fs.readFileSync(path.join(migrationsDir(), '002_order_number_seq.sql'), 'utf8');
  const f003 = fs.readFileSync(path.join(migrationsDir(), '003_customer_registration.sql'), 'utf8');
  assert.equal(
    normalizeSql(INIT_SCHEMA_SQL), normalizeSql(f001),
    'INIT_SCHEMA_SQL drifted from migrations/001_init.sql'
  );
  assert.equal(
    normalizeSql(ORDER_NUMBER_SEQ_SQL), normalizeSql(f002),
    'ORDER_NUMBER_SEQ_SQL drifted from migrations/002_order_number_seq.sql'
  );
  assert.equal(
    normalizeSql(CUSTOMER_REGISTRATION_SQL), normalizeSql(f003),
    'CUSTOMER_REGISTRATION_SQL drifted from migrations/003_customer_registration.sql'
  );
});
