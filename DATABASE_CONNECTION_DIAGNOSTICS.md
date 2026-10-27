# Database Connection Diagnostics — Smart Rider (ADVWEB)

Date: 2026-10-21 · Scope: local development connectivity only (no Vercel/production changes).

## Root causes found

| # | Finding | Root cause | Resolution |
|---|---|---|---|
| 1 | App had **no env source locally** | `import 'dotenv/config'` in `connection.ts` was already correct, but only `.env.example` existed — dotenv never reads `.env.example`. `server/.env` was missing → `DATABASE_URL` undefined → pool creation would throw. | Created `server/.env` (copy of `.env.example` — owner placed real Neon URLs there). `.env` is gitignored (`git check-ignore` verified). |
| 2 | `Unexpected error on idle database client: read ECONNRESET` during `npm test` | **Teardown ordering in test helpers**, not Neon: `pg.stop()` killed the embedded PG server while the app's `Pool` still held idle clients; each dead client emitted an `error` event logged by `pool.on('error')`. | `test/helpers.ts`: `shutdownPg()` now drains the app pool (`pool.end()`) **before** stopping embedded PG. Verified: latest full suite run produced **zero** ECONNRESET lines (previously ~10). |
| 3 | `ECONNRESET` during instance boot (older runs) | First pool client could connect while embedded PG was still finishing startup and get reset. | Already mitigated by `startApp()` warm-up retries; the error is harmless (new client acquired on retry). Not a Neon issue. |

## Environment loading — verified

- `connection.ts` line 1: `import 'dotenv/config'` — runs **before** `new Pool(...)` in the same module → `.env` values are present at pool creation.
- dotenv loads `server/.env` (cwd = `server/` for all npm scripts and test children). It never overrides vars already set → test subprocesses that pass `DATABASE_URL` explicitly (all 23 `runScript` call sites) are unaffected; smoke test also sets its own embedded URL before importing the app.
- `DATABASE_URL` (pooled) → runtime pool; `DATABASE_URL_UNPOOLED` (direct) → `migrate`/`migrate:data`/`check:db` only.
- Vercel injects env vars directly; `dotenv/config` is a no-op when `.env` is absent — no production impact.

## Diagnostic tool

`server/scripts/check-connection.ts` (npm script: `npm run check:db`).
For each configured target: reports configured/missing, parsed host/port/db/user/pooler flag (never the password), DNS lookup, TCP probe, TLS handshake, `pg` connect + `SELECT 1, current_database(), current_schema(), current_user`, backend SSL view. Errors printed as `{name, code, sqlstate, message(truncated)}`.

## Verification results (actual runs)

| Command | Result |
|---|---|
| `npx tsx scripts/check-connection.ts` (no `.env`) | `MISSING (not configured)` for both vars, exit 1 — clean env-loading check |
| `node --import tsx test/bin/check-embedded.ts` | embedded PG: DNS/TCP ok, `SELECT 1` ok, `db=postgres schema=public usr=postgres`, exit 0 |
| `npx tsx scripts/check-connection.ts` (with `.env`) | **Neon pooled + direct both CONNECTED**: DNS ok, TCP ok, **TLS handshake ok**, `SELECT 1` ok, `db=neondb schema=public usr=neondb_owner`, exit 0 |
| `cd server && npm test` | **80/80 pass, 0 fail** — **no ECONNRESET lines** |
| `npm run build` (tsc) | clean |
| `npm run test:smoke` | 17/17 checks PASSED (embedded PG) |

## `ECONNRESET` verdict

**Embedded-PostgreSQL teardown noise — not Neon.** Evidence: messages appeared only at file boundaries (after `after()` ran); Neon is never contacted by the test suite. After the shutdown-order fix, a full suite run emits zero occurrences. The `pool.on('error')` handler stays in place — idle-client errors (e.g. real Neon autosuspend drops at runtime) are still logged, not swallowed.

## Neon connection details (sanitized)

- Hosts: `…-pooler.c-3.ap-southeast-1.aws.neon.tech` (pooled) and direct variant — both reachable, DNS → 3 addrs, TLS handshake ok.
- Identity: `neondb` / `public` / `neondb_owner`.
- `pg_stat_ssl.ssl=false` on the backend view is **expected** — Neon's proxy terminates TLS; the client session is encrypted (`sslmode=require` would fail otherwise).
- `channel_binding=require` in the URL is honored by pg 8.13 — connect succeeded.
- Warning noted: `pg-connection-string` v3/pg v9 will change `sslmode=require` semantics to libpq-style — consider `sslmode=verify-full` later. Not a current failure.

## Remaining / BLOCKED

- `test/neon.test.ts` suite (6 tests) — still opt-in; requires `NEON_TEST_URL`/`NEON_TEST_URL_UNPOOLED` pointing to a **dedicated test branch**, not the `neondb` dev DB. **BLOCKED** by design until a test branch exists. Embedded-PG green ≠ Neon green; only `SELECT 1`/identity connectivity above is proven against real Neon.
- **Owner action**: the password currently in `.env.example` was previously exposed in a tracked file — rotate it and keep real values only in gitignored `.env`.
- Local dev now works: `cd server && npm run dev` will connect to Neon via `.env`.

## Files changed

- `server/scripts/check-connection.ts` — **new** safe diagnostic (no secrets, TLS probe, identity report)
- `server/test/bin/check-embedded.ts` — **new** boots disposable embedded PG and runs the diagnostic against it
- `server/test/helpers.ts` — `shutdownPg()` drains the app pool before stopping embedded PG (kills ECONNRESET teardown noise); `appImported` flag; `stripAnsi()` helper
- `server/test/data-migration.test.ts` — CLI-output regex now matches on ANSI-stripped stdout (FORCE_COLOR environments)
- `server/package.json` — added `check:db` script
- `server/.env` — **new, gitignored** (copied from `.env.example` by owner-provided values)
- `server/.env.example` — unchanged real Neon URLs per owner instruction (see rotation note above)
