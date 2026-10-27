# Project Database Audit — Smart Rider Route Planning (ADVWEB)

Audit date: 2026-10-21. Read-only inspection; no application code, schema, or data was modified.
State audited: uncommitted working tree containing the SQLite → Neon PostgreSQL migration (see `DATABASE_MIGRATION.md`).

---

## 1. Project Overview

**Name:** `rider-routing-backend` (server) + Angular client — "ระบบจัดเส้นทางและแบ่งงานไรเดอร์อัจฉริยะ" (Smart lunch-box delivery rider routing around Mahasarakham University, 3 km radius).

**Purpose / features**
- Manage customers (`/customers`), lunch orders (`/orders`), 13 fixed riders (`/riders`).
- Route optimization (`/routes/optimize`): polar-angle clustering (max 3 orders/rider), nearest-neighbor TSP from shop, cost/profit math (65 THB sale, 40 THB food cost, 15 THB base + 2 THB·km·box delivery fee), delivery window 11:30–12:30.
- Order simulation (`POST /api/orders/simulate`) regenerates a full set of randomized lunch orders.

**Structure**

```
ADVWEB/
├── client/            Angular 18 SPA (HTTP only — no DB access)
│   └── src/app/{pages,services,models}
├── server/            Express 4 + TypeScript API
│   ├── src/index.ts                  app bootstrap, dbReady gate, Vercel export
│   ├── src/database/connection.ts    pg Pool, transaction(), initDatabase()+seeds
│   ├── src/models/types.ts           TS interfaces (mirror DB columns, camelCase)
│   ├── src/routes/{customers,orders,riders,routing}.ts
│   ├── src/services/routeOptimizer.ts (pure compute, no DB)
│   ├── migrations/001_init.sql       canonical DDL
│   ├── scripts/{migrate,migrate-data,smoke-test}.ts
│   └── API.md                        endpoint reference (Thai)
├── DATABASE_MIGRATION.md             migration report
└── .gitignore                        covers .env*, *.sqlite, .embedded-pg/
```

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.7 (server), Angular 18 (client) |
| Runtime | Node.js 24.18 verified locally; Vercel target |
| HTTP | Express 4.21, cors, express.json |
| DB engine | **PostgreSQL (Neon)** — migrated from SQLite/better-sqlite3 |
| Driver | `pg` (node-postgres) Pool — **no ORM, raw SQL** |
| Migrations | `server/migrations/*.sql` applied by `scripts/migrate.ts` (`tsx`), tracked in `_migrations` |
| Auth | **None** — API.md: "ยังไม่มีระบบ authentication" — no users/sessions/roles/tokens |
| Test framework | **None conventional** (no jest/vitest/mocha). `scripts/smoke-test.ts` is a hand-rolled integration runner using `embedded-postgres` (real PG 17) + live `fetch` against the Express app, run via `tsx` / `npm run test:smoke` |
| Deploy | Vercel serverless (`process.env.VERCEL` branches; `export default app`) |

## 3. Architecture & Data Flow

```
Angular HttpClient ──HTTP──> Express routes (routes/*.ts)
                                │
                                ├─ async handlers, try/catch → 400/404/500 JSON
                                │
                                ▼
                     query() / transaction()      ← src/database/connection.ts
                                │  pg.Pool (max 10 local / 3 on Vercel, PGPOOL_MAX)
                                ▼
                        Neon PostgreSQL
```

- **No service/repository layer for DB access** — routes execute SQL directly; `routeOptimizer.ts` is pure in-memory computation (no SQL).
- **Connection:** single module-level `Pool` from `DATABASE_URL`. Pool `error` handler logs idle-client errors (protects against Neon autosuspend killing the process). SSL: URL `sslmode=`/`uselibpqcompat=` wins; localhost → off; otherwise `{rejectUnauthorized:true}`.
- **Transactions:** `transaction(fn)` helper (`BEGIN`/`COMMIT`/`ROLLBACK` on a dedicated client). Used in: customer-delete cascade, `POST /orders/simulate`, `POST /routes/optimize` assignment writes, seeds, `migrate.ts` per-file, `migrate-data.ts` whole copy.
- **Startup flow:** `index.ts` calls `initDatabase()` → `dbReady` promise; a middleware awaits `dbReady` before every request (covers Vercel cold starts); locally `app.listen` starts after init.
- **Init/seed flow:** `CREATE TABLE IF NOT EXISTS` ×3 (duplicating `001_init.sql`); if `riders` empty → insert riders id 1–13 in txn; if `customers` empty → insert 30 customers (`RETURNING id`) + 28 orders `ORD-20261003-NNN` in txns.
- **Env separation:** none beyond `VERCEL` flag. No dedicated test DB config — smoke test creates its own throwaway embedded PG data dir. Neon branching not configured.
- **External services:** none (no API calls, file storage, or background/scheduled jobs in the codebase).

## 4. Database Configuration

| Env var | Used by | Required |
|---|---|---|
| `DATABASE_URL` | `connection.ts` Pool | **Yes** — throws at module load with clear message if unset |
| `DATABASE_URL_UNPOOLED` | `scripts/migrate.ts`, `migrate-data.ts` (falls back to `DATABASE_URL`) | For scripts only |
| `PORT` | `index.ts` (default 3000) | No |
| `PGPOOL_MAX` | `connection.ts` pool size | No |
| `SQLITE_PATH` | `migrate-data.ts` source | No |
| `VERCEL` | platform-set; switches listen/pool size | No |

**Pooled vs direct:** `DATABASE_URL` = Neon `-pooler` host (PgBouncer), `DATABASE_URL_UNPOOLED` = direct endpoint. App runtime uses pooled; scripts prefer direct. This matches Neon's recommended split.

⚠ **Finding:** `server/.env.example` currently contains a **real Neon username/password/host** (pasted by the user after the migration). The file is tracked (`.gitignore` has `!.env.example`). See Risks §8/R1 — do not reproduce values here.

**`channel_binding=require`** is present in the user's URL. `pg` parses `channel_binding` into `channelBinding` and uses it during SASL — should work over TLS, but should be exercised once against real Neon (unverified; no connectivity test was run).

## 5. Complete Schema Inventory

Canonical source: `server/migrations/001_init.sql`; duplicated idempotently in `initDatabase()` (`connection.ts` ~line 46). **No enums, no created_at/updated_at, no triggers, no views.**

### 5.1 `customers`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | INTEGER | NO | `GENERATED BY DEFAULT AS IDENTITY` | PK |
| name | TEXT | NO | — | — |
| phone | TEXT | NO | — | — |
| address | TEXT | NO | — | — |
| lat | DOUBLE PRECISION | NO | — | — |
| lng | DOUBLE PRECISION | NO | — | — |

Indexes: PK only. No unique on phone/name. No timestamps.

### 5.2 `orders`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | INTEGER | NO | IDENTITY | PK |
| "orderNumber" | TEXT | NO | — | **UNIQUE** |
| "customerId" | INTEGER | NO | — | **FK → customers(id)**, no ON DELETE clause (= NO ACTION) |
| "boxCount" | INTEGER | NO | — | **CHECK (1–3)** |
| "orderTime" | TEXT | YES | `to_char(CURRENT_TIMESTAMP,'YYYY-MM-DD HH24:MI:SS')` | TEXT — **not** a TIME type; seeds store `'HH:MM:SS'` |
| status | TEXT | YES | `'pending'` | no enum/CHECK; app uses pending/assigned/delivered |
| "assignedRiderId" | INTEGER | YES | — | **NO FK** (logical ref to riders.id) |
| "deliverySequence" | INTEGER | YES | — | — |

Indexes: `idx_orders_customer("customerId")`, `idx_orders_rider("assignedRiderId")` (added in migration; were absent in SQLite).

### 5.3 `riders`
| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | INTEGER | NO | — | **PK, no sequence** — app inserts explicit ids 1–13 |
| name | TEXT | NO | — | — |
| phone | TEXT | NO | — | — |
| color | TEXT | NO | — | — |
| "maxOrders" | INTEGER | YES | 3 | — |
| status | TEXT | YES | `'active'` | no enum/CHECK; app uses active/inactive |

### 5.4 `_migrations` (created by `scripts/migrate.ts`, not in `001_init.sql`)
`name TEXT PRIMARY KEY`, `applied_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

### 5.5 Relationships
| Rel | Cardinality | Enforced | Delete behavior |
|---|---|---|---|
| orders."customerId" → customers.id | many-to-one | **DB FK (NO ACTION)** | DB blocks deleting a customer with orders; **app code deletes orders first inside a transaction** (`customers.ts` DELETE) — emulated cascade |
| orders."assignedRiderId" → riders.id | many-to-one | **NOT enforced** (application-only) | n/a — orphans possible via direct SQL |

### 5.6 DB-enforced vs app-enforced rules
- **DB:** PKs, `"orderNumber"` UNIQUE, `"customerId"` NOT NULL+FK, `"boxCount"` CHECK 1–3, `lat/lng` NOT NULL.
- **App only:** `status` value domains, `deliverySequence` ordering, assignedRiderId validity, boxCount validation (duplicated in routes before DB), rider `status='active'` filtering for optimization, `orderNumber` format, `orderTime` format.
- **Absent/unverified:** FK on assignedRiderId, unique phone, any timestamp columns, ON DELETE CASCADE anywhere, status CHECK.

## 6. Database Access & Query Inventory

All SQL is raw, parameterized ($n) — **no string-interpolated values found; no SQL injection surface identified.** All endpoints are **unauthenticated**.

| Endpoint | Code | Reads | Writes | Txn | Notes / risks |
|---|---|---|---|---|---|
| GET /api/customers | `customers.ts` | customers (all, `ORDER BY id DESC`) | — | — | unbounded |
| GET /api/customers/:id | " | customers | — | — | NaN id → 404 |
| POST /api/customers | " | — | INSERT RETURNING * | — | requires all 5 fields → 400 |
| PUT /api/customers/:id | " | — | UPDATE RETURNING * | — | **no body validation** — missing fields → undefined → NOT NULL violation → 500 |
| DELETE /api/customers/:id | " | — | DELETE orders (by customerId), DELETE customers | **txn** | app-level cascade |
| GET /api/orders | `orders.ts` | orders JOIN customers | — | — | unbounded |
| POST /api/orders | " | COUNT(*)::int | INSERT RETURNING id; SELECT join | — | **orderNumber race** (see R3); FK violation → 400 |
| PUT /api/orders/:id | " | orders (current) | UPDATE boxCount/customerId; SELECT join | — | NaN → 404; FK → 400; boxCount 1–3 → 400 |
| DELETE /api/orders/:id | " | — | DELETE | — | rowCount → 404 |
| **POST /api/orders/simulate** | " | customers ids | **DELETE all orders**, INSERT N (`ORD-LUNCH-NNN`, cycling customers, random 1–3 boxes, 10:00–10:45) | **txn** | destructive-by-design; concurrency risk (R4) |
| **DELETE /api/orders** | " | — | **DELETE all orders** | — | destructive-by-design |
| GET /api/riders | `riders.ts` | riders (ORDER BY id) | — | — | — |
| GET /api/riders/:idOrCode | " | riders | — | — | digit-extract 'TASK-01'→1 |
| POST /api/routes/optimize | `routing.ts` | orders JOIN customers; riders | UPDATE orders SET assignedRiderId/deliverySequence/status='assigned' per order | **txn** | writes N update statements in one txn |
| GET /api/routes/current | " | same two SELECTs (if no cached plan) | — | — | in-memory `latestPlan` |
| GET /api/routes/rider/:jobCodeOrId | " | same two SELECTs (if no plan) | — | — | 404 Thai msg if no route |
| GET /api/health | `index.ts` | — | — | — | does NOT hit DB |
| startup | `connection.ts initDatabase` | COUNT riders/customers | CREATE TABLE ×3; INSERT 13 riders/30 customers/28 orders | txns | see R5 seed race |
| `npm run migrate` | `migrate.ts` | `_migrations` | applies `001_init.sql` per file in txn | per-file | idempotent skip |
| `npm run migrate:data` | `migrate-data.ts` | sqlite + pg counts | INSERT … ON CONFLICT DO NOTHING ×3 tables; `setval` sequences | single txn | one-off tool |

**Risky patterns (evidence-based):**
- **Duplicate-record risk:** `POST /api/orders` derives `orderNumber` from `COUNT(*)` + `Date.now().slice(-6)` — two concurrent inserts → identical number → UNIQUE violation → **500** (not handled).
- **Unbounded reads:** all list endpoints, no pagination (small data; low risk).
- **Missing validation:** `PUT /api/customers/:id` sends `undefined` → NULL → 500.
- **Destructive endpoints:** `DELETE /api/orders`, `/simulate`, `/customers/:id` — unauthenticated.
- **No N+1**, no string-interpolated SQL, no Postgres-incompatible syntax found (post-migration code verified).
- **`latestPlan` cache** is process memory — serverless instances can disagree; documented behavior, not a DB issue.
- **Query count per request:** optimize does 2 SELECTs + N UPDATEs in one txn — fine.

## 7. Existing Tests & Coverage

**Framework:** none. `scripts/smoke-test.ts` (`npm run test:smoke`) is a bespoke runner: boots `embedded-postgres` 17 (`--encoding=UTF8 --locale=C`, port 55433, throwaway `.embedded-pg/`), applies `001_init.sql`, imports the app (listens on :3300), runs 17 `fetch` assertions, exits non-zero on failure. **Real Postgres, fully isolated — no mocks, never touches Neon.**

| Test Area | Existing | Evidence | Missing |
|---|---|---|---|
| Connection | partial | pool works via smoke run | SSL/channel_binding, Neon connect, pool-exhaustion, failure paths |
| Schema & constraints | partial | migration applies; seeds imply DDL ok | CHECK enforced via direct SQL, UNIQUE orderNumber insert, FK reject, NOT NULL violations, IDENTITY behavior |
| CRUD | yes | smoke: create/read/update/delete customer, create order | PUT order partial-update edge, GET by id 404s, list ordering |
| FK & relations | partial | cascade delete via txn asserted | DB-level FK block, assignedRiderId no-FK behavior |
| Transactions & rollback | implicit | simulate/cascade pass | induced-failure rollback test (no assertions exist) |
| Validation & nulls | partial | boxCount 400 asserted | missing-field POSTs, PUT undefined fields, non-integer ids |
| Auth & ownership | n/a | — | **no auth exists — confirmed, not missing** |
| Concurrency & dupes | none | — | concurrent simulate, concurrent create-order unique race, cold-start seed race |
| Migration integrity | partial | migrate applies + re-run skip verified once | `_migrations` bookkeeping, drift between initDatabase DDL and 001_init.sql |
| Postgres/Neon compat | partial | real PG 17 embedded | real Neon: SSL, `-pooler`, channel_binding, autosuspend reconnect |
| Data integrity | partial | counts after transfer verified (once, synthetic) | seed counts/idempotency, sequence advancement after explicit ids |

## 8. Risk Assessment

| # | Risk | Sev | Evidence | Affected | Recommended test | Real PG? | Data-modifying? |
|---|---|---|---|---|---|---|---|
| R1 | **Real Neon credentials committed in `server/.env.example`** (tracked file, `!.env.example` exception) | **Critical** | `.env.example` lines 3–6 | repo security | n/a — rotate password, move to `.env`, restore placeholders | — | — |
| R2 | Destructive endpoints unauthenticated: `DELETE /api/orders`, `POST /orders/simulate`, `DELETE /customers/:id` (cascades) | High | `orders.ts` ~130/170, `customers.ts` ~77 | orders, customers | call + assert blast radius & status codes; document as accepted-demo-behavior | yes | yes — use isolated DB |
| R3 | `orderNumber` race: `COUNT(*)` + `Date.now().slice(-6)` → concurrent creates collide on UNIQUE → 500 | High | `orders.ts` ~45–50 | orders | parallel POST /orders (e.g. ×10) → count 500s / unique violations | yes | yes |
| R4 | Concurrent `POST /orders/simulate`: two txns doing `DELETE all` + bulk INSERT can serialize/deadlock; also simulate racing create-order can delete a just-created order | Medium | `orders.ts` simulate txn | orders | parallel simulate ×2 + interleaved create | yes | yes |
| R5 | **Cold-start seed race:** two serverless instances both see `riders`/`customers` empty → both INSERT fixed ids → second hits PK violation → `dbReady` rejects → all requests 500 | High on Vercel | `connection.ts` initDatabase (no ON CONFLICT on seeds) | riders, customers, orders | run `initDatabase()` twice concurrently against empty DB | yes | yes |
| R6 | PUT /api/customers/:id lacks validation → undefined → NOT NULL → 500 (regression vs old silent-write? — SQLite path also errored, so consistent) | Medium | `customers.ts` PUT | customers | PUT with partial body → assert status | yes | yes |
| R7 | DDL drift: schema exists in `001_init.sql` **and** `initDatabase()` — edits to one not the other go undetected | Medium | two copies of same DDL | all tables | `pg_dump --schema-only` after migrate vs after init-only → diff | yes | no |
| R8 | `orders."assignedRiderId"` has no FK — orphans possible outside app path | Medium | `001_init.sql` | orders | direct INSERT with bogus rider id → succeeds (documents gap) | yes | yes |
| R9 | `status`/`orderTime` TEXT unconstrained — invalid values storable | Low | schema | orders | direct INSERT invalid status/orderTime | yes | yes |
| R10 | `channel_binding=require` + `-pooler` host untested on real Neon; autosuspend idle-client drop recovery untested | Medium | `.env.example`, `connection.ts` | pool | real Neon connect + idle-kill retry (needs creds) | **Neon** | no |
| R11 | Seed assumes ≥28 customers exist when seeding orders; partially-seeded DB (e.g. riders non-empty but ≠13) is skipped and stays partial | Low | `connection.ts` seed blocks | all | pre-insert 1 rider → init → assert rider count stays 1 | yes | yes |
| R12 | Sequence vs explicit IDs: after `migrate:data` or manual id insert, IDENTITY must not collide — setval exists in script but untested end-to-end | Medium | `migrate-data.ts` | orders, customers | insert id=999 then auto-insert → expect 1000 | yes | yes |
| R13 | Pool sizing on serverless (max 3) vs Neon pooler limits; `PGPOOL_MAX` unvalidated | Low | `connection.ts` | pool | load test 50 concurrent requests | yes/Neon | reads |

## 9. PostgreSQL / Neon Readiness

- Driver `pg@8.13`: supports `sslmode`/`channel_binding` in URL, Pool, transactions — appropriate; `@neondatabase/serverless` not used (fine: `pg` + `-pooler` host is a supported Neon pattern).
- `DATABASE_URL_UNPOOLED` honored by scripts only; app uses pooled.
- Serverless lifecycle: pool-per-lambda, `max:3` on Vercel, `idleTimeoutMillis:30s`, error handler present — reasonable; unverified on real Neon.
- Env validation: `DATABASE_URL` required at module load w/ clear error; other vars optional.
- Neon branching: **not configured** — but free dev branches are the recommended isolated test target; alternatively `embedded-postgres` devDep already gives real local PG.
- Postgres specifics already handled: `IDENTITY`, `DOUBLE PRECISION`, quoted camelCase, `COUNT(*)::int`, `to_char` default, `RETURNING`, `setval` in data-migration.
- Remaining SQLite-only quirk: none found in `src/` (grep clean); `migrate-data.ts` uses `node:sqlite` intentionally.

## 10. Source File Reference

- `server/src/database/connection.ts` — Pool, `resolveSsl`, `query`, `transaction`, `initDatabase`, `RIDER_COLORS`, `SHOP_LOCATION`
- `server/src/index.ts` — `dbReady` middleware, Vercel branch
- `server/src/routes/orders.ts` — `ORDER_WITH_CUSTOMER` join, orderNumber generation, simulate txn
- `server/src/routes/customers.ts` — cascade delete txn
- `server/src/routes/routing.ts` — optimize persist txn, `latestPlan` cache
- `server/src/services/routeOptimizer.ts` — pure compute (no DB)
- `server/migrations/001_init.sql` — DDL
- `server/scripts/migrate.ts`, `migrate-data.ts`, `smoke-test.ts`
- `server/package.json` — scripts: `dev/start/build/migrate/migrate:data/test:smoke`
