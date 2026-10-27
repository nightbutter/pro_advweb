# Database Test Gaps & Open Questions — Smart Rider (ADVWEB)

Companion to `PROJECT_DATABASE_AUDIT.md` / `DATABASE_TEST_BLUEPRINT.md`. Everything below is a **confirmed gap or unverified item** — no assumptions.

> **Status update (2026-10-21, post defect-fix):** all §1 test gaps are now covered by `server/test/` (`npm test`, 80 tests, all pass). Defects D1–D7 are FIXED — see `DATABASE_TEST_RESULTS.md`. Remaining open items: Neon connectivity (§2–§3, still BLOCKED), credential rotation, and the product decisions (FK on `assignedRiderId`, `status`/`orderTime` types, auth).

## 1. Confirmed Missing Tests

| Gap | Why it matters | Evidence | Blueprint ref |
|---|---|---|---|
| No real test framework | `smoke-test.ts` is a single linear script — no isolation per case, no assertions library, stops being useful as suite grows | `server/scripts/smoke-test.ts`; package.json has no test runner dep | all |
| No rollback assertion | txns exist but failure path never exercised | `connection.ts transaction()` used in 4 places, zero failure tests | D |
| No constraint tests at DB level | CHECK/UNIQUE/FK/NOT NULL only validated via route-level 400s, never via actual violation codes | `001_init.sql` | B |
| No concurrency tests | orderNumber race (R3), simulate lock contention (R4), cold-start seed race (R5) all untested | `orders.ts` ~45, `connection.ts` seeds | E |
| No seed idempotency/partial-seed tests | initDatabase re-run and half-seeded DBs unverified | `connection.ts` initDatabase | F |
| No migration-vs-init drift check | DDL duplicated in two places | `001_init.sql` + `connection.ts` | A3 |
| No schema-introspection test | nothing asserts actual columns/types/indexes | — | A1 |
| No `_migrations` bookkeeping test beyond one manual run | re-run skip verified once by hand | `scripts/migrate.ts` | A2 |
| No Neon/SSL/pooler/channel-binding test | real Neon never contacted | `.env.example`, `connection.ts resolveSsl` | G |
| No idle-connection drop/reconnect test | Neon autosuspend kills idle clients; handler exists, recovery unproven | `connection.ts` pool.on('error') | G2 |
| No error-shape test for DB failures | when `dbReady` rejects (bad URL/down DB), request path → Express default 500 HTML, not JSON `{error}` — unverified behavior | `index.ts` middleware | H/G |
| `PUT /api/customers/:id` partial-body → 500 not asserted anywhere | regression risk | `customers.ts` PUT | C1 |
| `assignedRiderId` orphan writes untested | no FK — gap is by design but undocumented in tests | schema | B6 |
| Identity sequence after explicit-id inserts | `setval` logic in migrate-data untested against real data | `scripts/migrate-data.ts` | B5 |
| `orderTime` format/precision round-trip | TEXT column, mixed `'HH:MM:SS'` vs timestamp-string default | `orders.ts` | C2 |

## 2. Open Questions / Blocked Verifications

| Question | Status | Needed to resolve |
|---|---|---|
| Does `channel_binding=require` + `-pooler` host connect under `pg@8.13`? | unverified — never ran against real Neon | run `SELECT 1` with the user's pooled URL (creds exist in working `.env.example` — **rotate first**) |
| Is seeded data present in the real `neondb` Neon database already? | unknown — no connectivity | `SELECT COUNT(*)` per table on Neon |
| Does `initDatabase()` race break Vercel cold starts in practice? | **code defect fixed** (advisory lock, D3); real-world occurrence on Neon unverified | two parallel invocations on empty Neon branch |
| Should `assignedRiderId` get a real FK? | decision pending | product/owner call; test exists either way (B6) |
| Expected behavior for `PUT customers` partial body — 400 or 500? | **resolved: 400** — PUT is full-replacement per API.md; validation added (D7) | none |
| Is `orderTime` ever meant to be a real `TIME`/`TIMESTAMP`? | stays TEXT per migration decision | if changed, format tests change |
| Minimum Node version for `migrate-data` (`node:sqlite` needs ≥23.4) — does the team's runtime satisfy it? | dev-machine is Node 24 ✓ | confirm prod/CI Node version |
| `_migrations` table absent if app bootstraps via `initDatabase()` only — later `npm run migrate` would try to re-apply `001_init.sql` (harmless, `IF NOT EXISTS`) but marks it applied retroactively | works, slightly inconsistent history | decide whether initDatabase should also record `_migrations` |

## 3. Evidence Needed / Access Required

- **Neon credentials/branch access** for G-series tests (currently only present — insecurely — in `.env.example`; rotate and move to `.env`).
- Confirmation whether production `neondb` already contains data (affects whether `migrate-data` is ever needed).
- Owner decisions: FK on `assignedRiderId`, PUT validation contract, auth roadmap (all current tests assume open API).

## 4. Risks Already Confirmed by Code Review (no test run needed)

- R1 (Critical): real credentials in tracked `.env.example` — **placeholders restored; rotation still required**.
- R3: orderNumber generation is not collision-safe under concurrency — **FIXED** (`order_number_seq`, D5).
- R5: seed inserts raced under concurrent init — **FIXED** (`pg_advisory_xact_lock`, D3).
- R7: dual DDL sources can drift — **FIXED** (initDatabase synced + fingerprint regression test, D2). Both DDL copies must still be kept in sync manually.
- Unbounded SELECTs on all list endpoints (accepted for demo scale).
