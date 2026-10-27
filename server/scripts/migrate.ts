/**
 * Applies SQL migrations from server/migrations/ to the target database.
 *
 * Uses DATABASE_URL_UNPOOLED (Neon direct endpoint) when available,
 * falling back to DATABASE_URL. Migrations are tracked in _migrations.
 *
 *   npm run migrate
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set. See server/.env.example');
  process.exit(1);
}

function sslFor(url: string) {
  if (/sslmode=|uselibpqcompat=/i.test(url)) return undefined;
  if (/@(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) return false;
  return { rejectUnauthorized: true };
}

const MIGRATE_LOCK_KEY = 727203;

async function main() {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  const client = new Client({ connectionString, ssl: sslFor(connectionString) });
  await client.connect();

  try {
    // Session-level advisory lock: concurrent `npm run migrate` invocations
    // serialize here — a second run waits for the first, then sees its
    // migrations already applied and exits cleanly. Session locks release
    // automatically if a holder crashes.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK_KEY]);

    const { rows: [ident] } = await client.query<{ db: string; usr: string }>(
      'SELECT current_database() AS db, current_user AS usr'
    );
    console.log(`Target: database=${ident.db} user=${ident.usr}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<{ name: string }>('SELECT name FROM _migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.name));

    const pending = files.filter((f) => !appliedSet.has(f));
    if (pending.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Pending: ${pending.join(', ')}`);
    }

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  skip  ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  apply ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK_KEY]);
    console.log('Migrations complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
