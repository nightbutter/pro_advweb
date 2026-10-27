/**
 * SQLite -> PostgreSQL data transfer tests (scripts/migrate-data.ts).
 * Uses synthetic node:sqlite fixtures — never real data.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { bootPg, createDb, connectDb, shutdownPg, runScript, stripAnsi, SERVER_DIR } from './helpers';
import type { Client } from 'pg';

const { DatabaseSync } = require('node:sqlite');

const TAG = 'datamig';
let booted: Awaited<ReturnType<typeof bootPg>>;
let fixtureDir: string;

function makeSqlite(file: string, opts: { orphan?: boolean; newSchema?: boolean } = {}) {
  const db = new DatabaseSync(file);
  // newSchema: post-baseline SQLite files have customers.zone and a users table.
  db.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, lat REAL, lng REAL${opts.newSchema ? ', zone TEXT' : ''});
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, orderNumber TEXT UNIQUE, customerId INTEGER, boxCount INTEGER, orderTime TEXT, status TEXT, assignedRiderId INTEGER, deliverySequence INTEGER);
    CREATE TABLE riders (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, color TEXT, maxOrders INTEGER, status TEXT);
    ${opts.newSchema ? 'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, passwordHash TEXT, role TEXT, riderId INTEGER);' : ''}
  `);
  const ins = (sql: string, ...args: any[]) => db.prepare(sql).run(...args);
  if (opts.newSchema) {
    ins(`INSERT INTO customers (name,phone,address,lat,lng,zone) VALUES (?,?,?,?,?,?)`, 'ทดสอบ หนึ่ง', '081', 'ที่อยู่ 1', 16.25, 103.25, 'ขามเรียง');
    ins(`INSERT INTO customers (name,phone,address,lat,lng,zone) VALUES (?,?,?,?,?,?)`, 'Test Two', '082', 'Addr 2', 16.26, 103.26, 'ท่าขอนยาง');
    ins(`INSERT INTO customers (name,phone,address,lat,lng,zone) VALUES (?,?,?,?,?,?)`, 'Test Three', '083', 'Addr 3', 16.27, 103.27, 'หน้าป้าย');
    ins(`INSERT INTO users (username,passwordHash,role,riderId) VALUES (?,?,?,?)`, 'admin', 'deadbeef:'.padEnd(140, 'a'), 'admin', null);
    ins(`INSERT INTO users (username,passwordHash,role,riderId) VALUES (?,?,?,?)`, 'rider01', 'deadbeef:'.padEnd(140, 'b'), 'rider', 1);
  } else {
    ins(`INSERT INTO customers (name,phone,address,lat,lng) VALUES (?,?,?,?,?)`, 'ทดสอบ หนึ่ง', '081', 'ที่อยู่ 1', 16.25, 103.25);
    ins(`INSERT INTO customers (name,phone,address,lat,lng) VALUES (?,?,?,?,?)`, 'Test Two', '082', 'Addr 2', 16.26, 103.26);
    ins(`INSERT INTO customers (name,phone,address,lat,lng) VALUES (?,?,?,?,?)`, 'Test Three', '083', 'Addr 3', 16.27, 103.27);
  }
  ins(`INSERT INTO riders (id,name,phone,color,maxOrders,status) VALUES (?,?,?,?,?,?)`, 1, 'Rider หนึ่ง', '089', '#E6194B', 3, 'active');
  ins(`INSERT INTO riders (id,name,phone,color,maxOrders,status) VALUES (?,?,?,?,?,?)`, 2, 'Rider สอง', '090', '#3CBA54', 3, 'active');
  ins(`INSERT INTO orders (orderNumber,customerId,boxCount,orderTime,status,assignedRiderId,deliverySequence) VALUES (?,?,?,?,?,?,?)`,
    'ORD-OLD-001', 1, 2, '10:05:00', 'assigned', 1, 1);
  ins(`INSERT INTO orders (orderNumber,customerId,boxCount,orderTime,status,assignedRiderId,deliverySequence) VALUES (?,?,?,?,?,?,?)`,
    'ORD-OLD-002', 2, 1, '10:10:00', 'delivered', 2, 1);
  ins(`INSERT INTO orders (orderNumber,customerId,boxCount,orderTime,status,assignedRiderId,deliverySequence) VALUES (?,?,?,?,?,?,?)`,
    'ORD-OLD-003', opts.orphan ? 999 : 3, 3, '10:20:00', 'pending', null, null);
  db.close();
}

before(async () => {
  booted = await bootPg(TAG, 56180);
  fixtureDir = path.join(SERVER_DIR, 'test', '.fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
});

after(async () => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  await shutdownPg(TAG);
});

test('data transfer preserves rows, ids, relationships; advances sequences', async () => {
  const sqliteFile = path.join(fixtureDir, 'ok.sqlite');
  makeSqlite(sqliteFile);
  const url = await createDb(booted, 'datamig_ok');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });

  const res = await runScript('scripts/migrate-data.ts', {
    DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SQLITE_PATH: sqliteFile
  });
  assert.equal(res.code, 0, res.stderr);
  // console.log object output may carry ANSI colors under FORCE_COLOR/TTY — normalize before matching.
  const cleanOut = stripAnsi(res.stdout);
  assert.match(cleanOut, /Target rows.*customers: 3.*riders: 2.*orders: 3/s);

  const db = await connectDb(url);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM customers')).rows[0].c, 3);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM riders')).rows[0].c, 2);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c, 3);
  const o1 = (await db.query(`SELECT * FROM orders WHERE "orderNumber"='ORD-OLD-001'`)).rows[0];
  assert.equal(o1.id, 1);
  assert.equal(o1.status, 'assigned');
  assert.equal(o1.assignedRiderId, 1);
  assert.equal(o1.orderTime, '10:05:00');
  // sequence advanced: next auto insert gets id > max
  const next = await db.query(
    `INSERT INTO orders ("orderNumber","customerId","boxCount") VALUES ('ORD-NEW-1',1,1) RETURNING id`);
  assert.ok(next.rows[0].id > 3, `sequence not advanced — got id ${next.rows[0].id}`);
  await db.end();
});

test('new-schema transfer preserves zone and migrates users', async () => {
  const sqliteFile = path.join(fixtureDir, 'newschema.sqlite');
  makeSqlite(sqliteFile, { newSchema: true });
  const url = await createDb(booted, 'datamig_new');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });

  const res = await runScript('scripts/migrate-data.ts', {
    DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SQLITE_PATH: sqliteFile
  });
  assert.equal(res.code, 0, res.stderr);

  const db = await connectDb(url);
  const zones = (await db.query('SELECT zone, COUNT(*)::int c FROM customers GROUP BY zone ORDER BY zone')).rows;
  assert.equal(zones.length, 3, 'zones were not transferred');
  const users = (await db.query('SELECT username, role, "riderId" FROM users ORDER BY id')).rows;
  assert.deepEqual(users, [
    { username: 'admin', role: 'admin', riderId: null },
    { username: 'rider01', role: 'rider', riderId: 1 }
  ]);
  // users identity sequence advanced past imported ids
  const nextU = await db.query(
    `INSERT INTO users (username,"passwordHash",role) VALUES ('u_new','h','rider') RETURNING id`);
  assert.ok(nextU.rows[0].id > 2, `users sequence not advanced — got ${nextU.rows[0].id}`);
  await db.end();
});

test('old-schema transfer leaves customers.zone at default', async () => {
  const sqliteFile = path.join(fixtureDir, 'oldschema.sqlite');
  makeSqlite(sqliteFile); // no zone column, no users table
  const url = await createDb(booted, 'datamig_old');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });

  const res = await runScript('scripts/migrate-data.ts', {
    DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SQLITE_PATH: sqliteFile
  });
  assert.equal(res.code, 0, res.stderr);

  const db = await connectDb(url);
  const zones = (await db.query('SELECT DISTINCT zone FROM customers')).rows.map((r) => r.zone);
  assert.deepEqual(zones, ['ขามเรียง'], 'zone column should fall back to its default');
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM users')).rows[0].c, 0);
  await db.end();
});

test('re-running data transfer is idempotent (ON CONFLICT DO NOTHING)', async () => {
  const sqliteFile = path.join(fixtureDir, 'ok2.sqlite');
  makeSqlite(sqliteFile);
  const url = await createDb(booted, 'datamig_rerun');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });
  const env = { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SQLITE_PATH: sqliteFile };
  await runScript('scripts/migrate-data.ts', env);
  const res = await runScript('scripts/migrate-data.ts', env);
  assert.equal(res.code, 0, res.stderr);
  const db = await connectDb(url);
  assert.equal((await db.query('SELECT COUNT(*)::int c FROM orders')).rows[0].c, 3, 'duplicates created on re-run');
  await db.end();
});

test('transfer failure rolls back everything (orphan order fixture)', async () => {
  const sqliteFile = path.join(fixtureDir, 'bad.sqlite');
  makeSqlite(sqliteFile, { orphan: true });
  const url = await createDb(booted, 'datamig_bad');
  await runScript('scripts/migrate.ts', { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url });

  const res = await runScript('scripts/migrate-data.ts', {
    DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, SQLITE_PATH: sqliteFile
  });
  assert.notEqual(res.code, 0, 'orphan FK order should fail the transfer');

  const db = await connectDb(url);
  const counts = (await db.query(`
    SELECT (SELECT COUNT(*)::int FROM customers) c,
           (SELECT COUNT(*)::int FROM riders) r,
           (SELECT COUNT(*)::int FROM orders) o`)).rows[0];
  assert.deepEqual(counts, { c: 0, r: 0, o: 0 }, 'partial transfer committed — not atomic');
  await db.end();
});

test('missing sqlite source exits non-zero with clear error', async () => {
  const url = await createDb(booted, 'datamig_missing');
  const res = await runScript('scripts/migrate-data.ts', {
    DATABASE_URL: url, SQLITE_PATH: path.join(fixtureDir, 'does-not-exist.sqlite')
  });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr + res.stdout, /not found/i);
});
