/**
 * Shared test infrastructure.
 *
 * Each *.test.ts file runs in its own node --test subprocess, so every file
 * boots its own disposable EmbeddedPostgres (own data dir + own port) and can
 * import the app with a unique DATABASE_URL.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_DIR = path.resolve(__dirname, '..');
const PG_PASSWORD = 'postgres';

interface Booted {
  pg: EmbeddedPostgres;
  admin: Client;
  port: number;
  dir: string;
}

const instances = new Map<string, Booted>();

// Set when startApp() imported server.ts into THIS process, so shutdownPg()
// knows the app's pg.Pool must be drained before the embedded server stops.
let appImported = false;

/** Start (once per process) a disposable embedded Postgres. */
export async function bootPg(tag: string, port: number): Promise<Booted> {
  const existing = instances.get(tag);
  if (existing) return existing;

  const dir = path.join(SERVER_DIR, '.embedded-pg', tag);
  fs.rmSync(dir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: PG_PASSWORD,
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {}
  });
  await pg.initialise();
  await pg.start();

  const admin = new Client({
    connectionString: `postgres://postgres:${PG_PASSWORD}@localhost:${port}/postgres`
  });
  await admin.connect();

  const booted = { pg, admin, port, dir };
  instances.set(tag, booted);
  return booted;
}

/** Create a fresh empty database on the booted instance; returns its URL. */
export async function createDb(booted: Booted, name: string): Promise<string> {
  await booted.admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await booted.admin.query(`CREATE DATABASE "${name}"`);
  return `postgres://postgres:${PG_PASSWORD}@localhost:${booted.port}/${name}`;
}

/** Open a dedicated Client to a database on the booted instance. */
export async function connectDb(url: string): Promise<Client> {
  const c = new Client({ connectionString: url });
  await c.connect();
  return c;
}

/** Stop embedded PG and remove the data dir. Call in after(). */
export async function shutdownPg(tag: string): Promise<void> {
  const b = instances.get(tag);
  if (!b) return;
  instances.delete(tag);
  // Drain the app's pool FIRST: stopping the PG server while the pool still
  // holds idle clients emits 'error' (ECONNRESET) on each of them — teardown
  // noise that looks like a real connection failure.
  if (appImported) {
    try { const { pool } = await import('../dbconnect'); await pool.end(); } catch {}
  }
  try { await b.admin.end(); } catch {}
  try { await b.pg.stop(); } catch {}
  // Windows may hold file locks briefly after pg stops
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(b.dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/**
 * Point the app at `url` and import server.ts (which listens on `port`).
 * Must be called before ANY import of the app modules in this process.
 */
export async function startApp(url: string, port: number): Promise<string> {
  process.env.DATABASE_URL = url;
  process.env.PORT = String(port);
  await import('../server');
  appImported = true;
  const base = `http://localhost:${port}/api`;
  // health endpoint itself waits on dbReady via middleware
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) break;
    } catch {}
    await sleep(100);
  }
  // warm the pool + prove auth seeding: login succeeds only once initDatabase
  // has created the users table and seeded the admin account.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin1234' })
      });
      if (r.ok) return base;
    } catch {}
    await sleep(100);
  }
  throw new Error(`app did not become ready on :${port}`);
}

/** POST /api/auth/login; returns the JWT (throws on non-200). */
export async function login(base: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error(`login failed for ${username}: HTTP ${res.status}`);
  const body = await res.json();
  return body.token as string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run a repo script (scripts/*.ts or server.ts) in a child node+tsx process. */
export function runScript(scriptRelPath: string, env: NodeJS.ProcessEnv): Promise<ScriptResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', path.join(SERVER_DIR, scriptRelPath)],
      { cwd: SERVER_DIR, env: { ...process.env, ...env }, timeout: 60_000 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

/** POST/PUT/DELETE helpers returning {status, body}. Pass `token` for authenticated endpoints. */
export async function req(
  base: string,
  method: string,
  pathName: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; body: any; contentType: string | null }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const contentType = res.headers.get('content-type');
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, body: parsed, contentType };
}

export function migrationsDir(): string {
  return path.join(SERVER_DIR, 'migrations');
}

/** Strip ANSI escape codes (FORCE_COLOR/TTY environments colorize console.log output). */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|[0-9]{1,3}(?:;[0-9]{1,3}){0,3}m)/g, '');
}
