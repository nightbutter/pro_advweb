/**
 * One-off data transfer: SQLite (database.sqlite) -> PostgreSQL (Neon).
 *
 * Copies customers, riders and orders preserving IDs, timestamps and
 * relationships, then resets the Postgres identity sequences so new
 * inserts continue from the highest existing ID. Prints row counts for
 * verification. Safe to re-run: existing rows are skipped (ON CONFLICT).
 *
 *   npm run migrate:data
 *
 * Source file: server/database.sqlite (override with SQLITE_PATH env var).
 * Target:      DATABASE_URL_UNPOOLED or DATABASE_URL.
 * Requires Node.js >= 23.4 (built-in node:sqlite module).
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { Client } from 'pg';

// node:sqlite is available without a flag on Node >= 23.4
const { DatabaseSync } = require('node:sqlite');

const sqlitePath = process.env.SQLITE_PATH || path.resolve(__dirname, '../database.sqlite');
const pgUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}
if (!pgUrl) {
  console.error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set. See server/.env.example');
  process.exit(1);
}

function sslFor(url: string) {
  if (/sslmode=|uselibpqcompat=/i.test(url)) return undefined;
  if (/@(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) return false;
  return { rejectUnauthorized: true };
}

async function main() {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pg = new Client({ connectionString: pgUrl, ssl: sslFor(pgUrl) });
  await pg.connect();

  try {
    const customers = sqlite.prepare('SELECT * FROM customers').all() as any[];
    const riders = sqlite.prepare('SELECT * FROM riders').all() as any[];
    const orders = sqlite.prepare('SELECT * FROM orders').all() as any[];

    // Optional columns/tables that only exist in newer SQLite databases.
    const customerCols = sqlite.prepare("PRAGMA table_info(customers)").all() as any[];
    const hasZone = customerCols.some((c) => c.name === 'zone');
    const hasUsers = (sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .all() as any[]).length > 0;
    const users = hasUsers ? (sqlite.prepare('SELECT * FROM users').all() as any[]) : [];

    await pg.query('BEGIN');

    for (const c of customers) {
      await pg.query(
        `INSERT INTO customers (id, name, phone, address, lat, lng${hasZone ? ', zone' : ''})
         VALUES ($1,$2,$3,$4,$5,$6${hasZone ? ',$7' : ''})
         ON CONFLICT (id) DO NOTHING`,
        hasZone
          ? [c.id, c.name, c.phone, c.address, c.lat, c.lng, c.zone]
          : [c.id, c.name, c.phone, c.address, c.lat, c.lng]
      );
    }
    for (const r of riders) {
      await pg.query(
        `INSERT INTO riders (id, name, phone, color, "maxOrders", status)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.name, r.phone, r.color, r.maxOrders, r.status]
      );
    }
    for (const o of orders) {
      await pg.query(
        `INSERT INTO orders (id, "orderNumber", "customerId", "boxCount", "orderTime", status, "assignedRiderId", "deliverySequence")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [o.id, o.orderNumber, o.customerId, o.boxCount, o.orderTime, o.status, o.assignedRiderId, o.deliverySequence]
      );
    }

    for (const u of users) {
      await pg.query(
        `INSERT INTO users (id, username, "passwordHash", role, "riderId")
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.username, u.passwordHash, u.role, u.riderId ?? null]
      );
    }

    // Keep identity sequences ahead of the imported IDs.
    await pg.query(`SELECT setval(pg_get_serial_sequence('customers','id'), COALESCE((SELECT MAX(id) FROM customers), 1))`);
    await pg.query(`SELECT setval(pg_get_serial_sequence('orders','id'), COALESCE((SELECT MAX(id) FROM orders), 1))`);
    if (hasUsers) {
      await pg.query(`SELECT setval(pg_get_serial_sequence('users','id'), COALESCE((SELECT MAX(id) FROM users), 1))`);
    }

    await pg.query('COMMIT');

    const counts = await pg.query(`
      SELECT
        (SELECT COUNT(*)::int FROM customers) AS customers,
        (SELECT COUNT(*)::int FROM riders)    AS riders,
        (SELECT COUNT(*)::int FROM orders)    AS orders,
        (SELECT COUNT(*)::int FROM users)     AS users
    `);
    console.log('Source rows  ->', { customers: customers.length, riders: riders.length, orders: orders.length, users: users.length });
    console.log('Target rows  ->', counts.rows[0]);
    console.log('Data transfer complete.');
  } catch (err) {
    await pg.query('ROLLBACK');
    throw err;
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error('Data transfer failed:', err.message);
  process.exit(1);
});
