/**
 * Read-only verification of the configured PostgreSQL/Neon target.
 *
 * Confirms the database the app would actually use contains the required
 * schema objects and reports table row counts — without writing anything.
 * Prints the database/user identity (never credentials) so the operator can
 * confirm the intended Neon project/branch is selected.
 *
 *   npm run check:target        (uses DATABASE_URL)
 *   DATABASE_URL_UNPOOLED only: set VERIFY_USE_UNPOOLED=1
 */
import 'dotenv/config';
import { Client } from 'pg';

const url = process.env.VERIFY_USE_UNPOOLED === '1'
  ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  : process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. See server/.env.example');
  process.exit(1);
}

function sslFor(u: string) {
  if (/sslmode=|uselibpqcompat=/i.test(u)) return undefined;
  if (/@(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(u)) return false;
  return { rejectUnauthorized: true };
}

let failures = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, ok ? '' : (extra ?? ''));
  if (!ok) failures++;
};

async function main() {
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const { rows: [ident] } = await client.query(
      `SELECT current_database() AS db, current_schema() AS schema, current_user AS usr,
              inet_server_port() AS port, version() AS version`
    );
    console.log(`Target: db=${ident.db} schema=${ident.schema} user=${ident.usr} port=${ident.port}`);
    console.log(`Server: ${String(ident.version).split(' ').slice(0, 2).join(' ')}`);

    const tables = (await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    )).rows.map((r) => r.table_name);
    for (const t of ['customers', 'orders', 'riders', 'users']) {
      check(`table ${t}`, tables.includes(t));
    }

    const seqs = (await client.query<{ sequence_name: string }>(
      `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`
    )).rows.map((r) => r.sequence_name);
    check('sequence order_number_seq', seqs.includes('order_number_seq'));

    const idx = (await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    )).rows.map((r) => r.indexname);
    check('index idx_orders_customer', idx.includes('idx_orders_customer'));
    check('index idx_orders_rider', idx.includes('idx_orders_rider'));

    const zoneCheck = (await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public' AND t.relname = 'customers' AND c.contype = 'c'`
    )).rows.find((r) => r.def.includes('zone'));
    check('customers.zone CHECK (3 zones)', !!zoneCheck, 'no CHECK constraint on zone');
    if (zoneCheck) {
      check('zone values UTF-8 intact',
        zoneCheck.def.includes('ขามเรียง') && zoneCheck.def.includes('ท่าขอนยาง') && zoneCheck.def.includes('หน้าป้าย'));
    }

    const counts = (await client.query(`
      SELECT (SELECT COUNT(*)::int FROM customers) AS customers,
             (SELECT COUNT(*)::int FROM riders)    AS riders,
             (SELECT COUNT(*)::int FROM orders)    AS orders,
             (SELECT COUNT(*)::int FROM users)     AS users`
    )).rows[0];
    console.log(`Rows: customers=${counts.customers} riders=${counts.riders} orders=${counts.orders} users=${counts.users}`);
    check('riders seeded', counts.riders > 0);
    check('users seeded (admin exists)', counts.users > 0);

    const badZones = (await client.query(
      `SELECT COUNT(*)::int AS c FROM customers
       WHERE zone NOT IN ('ขามเรียง','ท่าขอนยาง','หน้าป้าย')`
    )).rows[0].c;
    check('all customer zones valid', badZones === 0, `${badZones} invalid`);

    const orphans = (await client.query(
      `SELECT COUNT(*)::int AS c FROM orders o
       LEFT JOIN customers c ON c.id = o."customerId" WHERE c.id IS NULL`
    )).rows[0].c;
    check('no orphan orders', orphans === 0, `${orphans} orphans`);

    try {
      const { rows: [ssl] } = await client.query(`SELECT ssl_is_used() AS used`);
      console.log(`Session TLS: ${ssl.used ? 'yes' : 'terminated upstream (Neon pooler)'}`);
    } catch {
      // ssl_is_used() unavailable through some proxies/poolers — check-connection.ts
      // already proves the TLS handshake on the client side.
      console.log('Session TLS: ssl_is_used() unavailable on this endpoint (client-side TLS verified by check:db)');
    }
  } finally {
    await client.end();
  }
  console.log(failures === 0 ? 'TARGET VERIFIED' : `${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('verify-target error:', err.message);
  process.exit(1);
});
