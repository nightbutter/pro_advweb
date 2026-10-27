# Database Test Results — Smart Rider (ADVWEB)

Last execution: 2026-10-21 (post-fix run). Runner: `node:test` + tsx — `cd server && npm test`.
Target: **disposable `embedded-postgres` 17 instances only** — one per test file, auto-created and destroyed under `server/.embedded-pg/`. No production or Neon credentials were used. Real Neon credentials previously committed in `.env.example` were replaced with placeholders (rotate them — they are compromised).

## Test counts

| Run | Result |
|---|---|
| Baseline (before fixes) | 79 tests — 77 PASS / **2 FAIL** (intentional defect signals) |
| **Current (after fixes)** | **80 tests — 80 PASS / 0 FAIL**; Neon suite skipped (opt-in) |
| Concurrency iterations | order-create **450 requests** (50×3 runs, executed 3× standalone + in-suite) — 0 failures, all `orderNumber` unique · simulate **18 pairs** (2×3, 3 executions) — all 200, consistent · concurrent init **20 pairs** (2×5, 2 executions) — 0 rejections |
| Build | `npm run build` (tsc) — clean |
| Smoke test | `npm run test:smoke` — 17/17 checks PASSED |

## Outcome legend
FIXED = regression test proves corrected behavior · FAIL = still reproducible · CHARACTERIZED = documented, no defect · BLOCKED = access missing · NEEDS DECISION = correctness needs product call

## 1. Defect status after fixes

| ID | Defect (root cause → fix) | Status | Evidence |
|---|---|---|---|
| D1 | `GET /api/riders/abc` → 500. `parseInt` → `NaN` → PG cast error `22P02`. **Fix:** route now requires either all-digit input or a code containing letters + digits before SQL; anything else short-circuits to 404 — no `NaN` reaches the driver. | **FIXED** | `api-routing.test.ts`: `abc`, `1.5`, `TASK`, `--`, `99`, `TASK-99` all → 404; `1`, `RD-01`, `TASK-01` still work. |
| D2 | Schema drift: `initDatabase()` lacked `idx_orders_customer`/`idx_orders_rider` from `001_init.sql`. **Fix:** both `CREATE INDEX IF NOT EXISTS` statements added to `initDatabase()` DDL, which now runs inside one transaction alongside the new `order_number_seq` sequence (added to both paths; canonical migration `002_order_number_seq.sql` created for existing DBs). | **FIXED** | `migrations.test.ts` fingerprint test: migrate-built DB vs init-built DB now identical across tables, columns/defaults/nullability, constraints, indexes, **and sequences**. |
| D3 | Cold-start seed race: concurrent `initDatabase()` → `23505` on seed insert. **Fix:** whole init (DDL + seeds) wrapped in one transaction guarded by `pg_advisory_xact_lock(727201)` — second worker waits for the lock, then sees seeded counts and skips. | **FIXED** | `seeds.test.ts`: 5 consecutive fresh-DB runs of 2 concurrent inits → `rejected:0` every run; final state exactly 13/30/28; repeated run also clean. |
| D4 | Init failure crashed the serverless worker (`dbReady` rejected with no handler → unhandled rejection, exit 1, **no HTTP response**). **Fix:** `index.ts` uses `ensureDb()` — the init promise always resolves (`true`/`false`), failure resets it so the next request retries; middleware returns **503 JSON** until ready. Local mode still exits 1 on startup failure. | **FIXED** | `probe-init-failure.ts` (VERCEL=1, unreachable DB): process exits 0 and the probe receives `503` + `application/json` + `{"error":"Database initialization failed"}`. Unreachable-DB local startup still exits non-zero. |
| D5 | `orderNumber` race: `COUNT(*)`+`Date.now().slice(-6)` collides → `23505` → 500. **Fix:** `nextval('order_number_seq')` — concurrency-safe; format preserved (`ORD-<ts6>-<seq2+>`); UNIQUE constraint retained as final guard. | **FIXED** | `concurrency.test.ts`: 3 runs × 50 concurrent creates → **all 150 succeed**, all numbers unique, no orphans. Repeated standalone runs also 100% success. |
| D6 | Concurrent `/orders/simulate`: 200+500 (lock contention on `DELETE`+`INSERT`). **Fix:** policy chosen = **serialize** — `pg_advisory_xact_lock(727202)` inside the existing transaction; second request waits, both succeed, last-writer-wins. Documented in `API.md`. | **FIXED** | `concurrency.test.ts`: 3 runs × 2 concurrent sims → all `200`, final state = exactly one complete simulation (15 `ORD-LUNCH-*`, unique, no orphans). Trigger-injected mid-sim failure still rolls back (`transactions.test.ts`). |
| D7 | `PUT /api/customers/:id` partial body → 500 (NULL → `23502`). **Fix:** PUT confirmed as full-replacement (matches `API.md` "ต้องส่งครบทุกฟิลด์"); missing/invalid fields → `400` before SQL. | **FIXED** | `api-customers.test.ts`: partial body, empty body, each field omitted, nulls, empty strings, wrong types → all `400`, row verified unchanged; full body still 200; nonexistent id → 404. |
| D8 | Real Neon credentials in tracked `.env.example` | **CRITICAL — mitigated in repo** (placeholders); **owner action still required: rotate password + review git history** | unchanged |

## 2. Passed areas (all verified on real PostgreSQL)

| Area | Tests | Highlights |
|---|---|---|
| Schema introspection | 11 | tables, columns, types, nullability, `is_identity`, PKs, UNIQUE, CHECK def, FK `confdeltype=a`, indexes, `_migrations` records both `001_init.sql` + `002_order_number_seq.sql`, quoted-camelCase |
| DB constraints (direct SQL) | 8 enforce + 4 gap | `23505`/`23514`/`23503`/`23502` with constraint names; no partial rows after failure |
| Documented gaps | 3 | `assignedRiderId` accepts orphans (no FK — design decision, unchanged), `status`/`orderTime` arbitrary text |
| CRUD | 30 | unicode round-trip, joins, 400/404 paths, simulate atomicity, optimize persistence, ≤3 orders/rider |
| Transactions | 6 | trigger-injected mid-transaction failures prove customer-cascade, simulate, optimize all atomic |
| Seeds/init | 7 | 13/30/28, idempotent, partial-seed skip, advisory-lock race fix ×5, missing/unreachable DB → non-zero exit, **503 probe** |
| Migrations | 4 | apply 001+002 + record, idempotent skip, failed migration not recorded, **init-vs-migrate fingerprint equal** |
| Data migration | 4 | sqlite fixture: counts/ids/sequences preserved, re-run idempotent, FK-orphan rolls back |
| Concurrency | 3 | 50×3 creates, 2×3 sims, 20 concurrent reads |

## 3. Blocked / not run

- **Neon integration suite** (`test/neon.test.ts`): `BLOCKED` — skipped by design; enable with `NEON_TEST_URL`/`NEON_TEST_URL_UNPOOLED` on a dedicated test branch with rotated credentials. Embedded-PG success is not evidence of Neon connectivity.
- Production connectivity: not attempted (by policy). No production data touched.

## 4. Owner actions still required

1. **Rotate the leaked Neon password** (it was committed in tracked `.env.example`) and review git history for exposure.
2. Provision a dedicated Neon test branch to unblock the Neon suite.
3. Optional product decisions: `assignedRiderId` FK enforcement, `status`/`orderTime` column types, auth on destructive endpoints.
