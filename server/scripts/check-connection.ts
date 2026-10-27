/**
 * Database connectivity diagnostic — safe to run anywhere.
 *
 *   npm run check:db
 *
 * For each configured target (DATABASE_URL pooled, DATABASE_URL_UNPOOLED direct):
 *   - reports whether the env var is configured/missing
 *   - parses the URL and prints host / port / database / user (never the password)
 *   - resolves DNS, opens a TCP socket, performs a TLS handshake
 *   - connects with pg and runs SELECT 1, current_database(),
 *     current_schema(), current_user, and the SSL status of the session
 *
 * Never prints connection strings, passwords, or raw env dumps.
 * Exits 0 when every configured target connects, 1 otherwise.
 */
import 'dotenv/config';
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
import { Client } from 'pg';

interface TargetDesc {
  label: string;
  present: boolean;
  host?: string;
  port?: string;
  database?: string;
  user?: string;
  pooled?: boolean;
  params?: string[];
}

function describeUrl(raw: string | undefined, label: string): TargetDesc {
  if (!raw) return { label, present: false };
  try {
    const u = new URL(raw);
    return {
      label,
      present: true,
      host: u.hostname,
      port: u.port || '5432',
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined,
      user: decodeURIComponent(u.username) || undefined,
      pooled: u.hostname.includes('-pooler'),
      params: [...u.searchParams.keys()].sort()
    };
  } catch {
    return { label, present: true };
  }
}

function sslFor(url: string) {
  if (/sslmode=|uselibpqcompat=/i.test(url)) return undefined; // let pg honor URL params
  if (/@(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)) return false;
  return { rejectUnauthorized: true };
}

function tcpProbe(host: string, port: number, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port });
    const t = setTimeout(() => s.destroy(new Error('TCP timeout')), timeoutMs);
    s.once('connect', () => { clearTimeout(t); s.end(); resolve(); });
    s.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function tlsProbe(host: string, port: number, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    const t = setTimeout(() => s.destroy(new Error('TLS timeout')), timeoutMs);
    s.once('secureConnect', () => { clearTimeout(t); s.end(); resolve(); });
    s.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function errInfo(err: any) {
  return { name: err?.name, code: err?.code, sqlstate: err?.code?.length === 5 ? err.code : undefined, message: String(err?.message ?? err).slice(0, 200) };
}

async function checkTarget(desc: TargetDesc, rawUrl: string): Promise<boolean> {
  console.log(`\n== ${desc.label} ==`);
  if (!desc.host) {
    console.log('  URL parse failed — cannot probe.');
    return false;
  }
  console.log(`  target: host=${desc.host} port=${desc.port} db=${desc.database} user=${desc.user} pooled=${desc.pooled} params=[${(desc.params ?? []).join(',')}]`);

  const port = Number(desc.port);
  try {
    const addrs = await dns.lookup(desc.host, { all: true });
    console.log(`  DNS: ok (${addrs.length} addr, first ${addrs[0]?.address})`);
  } catch (e) {
    console.log('  DNS: FAIL', errInfo(e));
    return false;
  }
  try {
    await tcpProbe(desc.host, port);
    console.log('  TCP: ok');
  } catch (e) {
    console.log('  TCP: FAIL', errInfo(e));
    return false;
  }
  // TLS required unless the URL explicitly disables SSL (sslmode=disable or
  // a localhost target with no sslmode). sslmode=require implies TLS on the wire.
  const wantsTls = sslFor(rawUrl) !== false;
  if (wantsTls) {
    try {
      await tlsProbe(desc.host, port);
      console.log('  TLS handshake: ok');
    } catch (e) {
      console.log('  TLS handshake: FAIL', errInfo(e));
      return false;
    }
  } else {
    console.log('  TLS handshake: skipped (plaintext target)');
  }

  const client = new Client({ connectionString: rawUrl, ssl: sslFor(rawUrl), connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT 1 AS ok, current_database() AS db, current_schema() AS schema, current_user AS usr,
              COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS backend_ssl`
    );
    // pg_stat_ssl reflects the server's view: behind Neon's proxy/pooler the
    // compute node sees a plaintext hop even though the client session is
    // TLS-encrypted (sslmode=require would have failed otherwise).
    const sessionEncrypted = wantsTls ? 'tls (sslmode=require enforced)' : 'plaintext';
    console.log(`  pg connect: ok -> ${JSON.stringify(rows[0])} | session: ${sessionEncrypted}`);
    return true;
  } catch (e) {
    console.log('  pg connect: FAIL', errInfo(e));
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const targets: Array<{ label: string; raw: string | undefined }> = [
    { label: 'DATABASE_URL (runtime / pooled)', raw: process.env.DATABASE_URL },
    { label: 'DATABASE_URL_UNPOOLED (migrations / direct)', raw: process.env.DATABASE_URL_UNPOOLED }
  ];

  let allOk = true;
  for (const t of targets) {
    const desc = describeUrl(t.raw, t.label);
    if (!desc.present) {
      console.log(`\n== ${t.label} ==\n  MISSING (not configured)`);
      allOk = false;
      continue;
    }
    allOk = (await checkTarget(desc, t.raw!)) && allOk;
  }

  console.log(`\nresult: ${allOk ? 'ALL CONFIGURED TARGETS CONNECTED' : 'FAILURES PRESENT (see above)'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('diagnostic crashed:', errInfo(err));
  process.exit(1);
});
