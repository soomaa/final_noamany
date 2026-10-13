# Safe Prisma Migration Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the explicitly disposable MySQL test database from the repository's 122 Prisma migrations, in verified chronological batches.

**Architecture:** The current schema is drifted: five migrations are recorded while 117 earlier migrations are not. Create a recoverable SQL dump, reset only the configured local database `noamany_final_new`, then execute each migration SQL file and record it only after its SQL succeeds. Batches have fixed cumulative migration counts and stop at the first error.

**Tech Stack:** MySQL 8 via XAMPP, Prisma CLI 5.22, Node.js 22, NestJS 11.

**Spec:** `docs/superpowers/specs/2026-09-25-prisma-migration-rebuild-design.md`

## Global Constraints

- The only reset target is the configured local MySQL database `noamany_final_new` at `127.0.0.1:3306`.
- The database contents are test data, but a successful SQL backup is mandatory before reset.
- Never run one unbounded `prisma migrate deploy` against the old drifted database.
- Execute migrations strictly in sorted directory order; do not edit migration SQL to bypass an error.
- Stop on the first SQL, migration-ledger, Prisma connectivity, or backend-health failure.
- Do not expose database credentials in commands, logs, or the plan.

## Review Focus

- Backup file is non-empty and can be listed before the target database is dropped.
- Reset target is exactly `127.0.0.1:3306/noamany_final_new`, never a different host or database.
- A migration is never recorded in `_prisma_migrations` unless its SQL execution succeeded.
- Every batch's ledger count equals the expected cumulative count: 13, 66, 91, 101, then 122.
- Final backend health check reaches the rebuilt database and returns a healthy response.

---

## File / artifact structure

- Create: `D:\26-8\noamany-engineer17-9\.migration-backups\noamany_final_new-<timestamp>.sql` — recoverable pre-reset MySQL dump.
- Read: `backend\.env` — source of the connection only; credentials remain private.
- Read: `backend\prisma\migrations\<migration>\migration.sql` — immutable ordered migration inputs.
- Read/write through Prisma: `_prisma_migrations` in `noamany_final_new` — authoritative ledger for this rebuild.

### Task 1: Establish the recovery checkpoint

**Files:**
- Create: `.migration-backups/noamany_final_new-<timestamp>.sql`
- Read: `backend/.env`

**Interfaces:**
- Consumes: `DATABASE_URL` from `backend/.env` without printing its password.
- Produces: one non-empty SQL dump and a redacted target identity `{ host: "127.0.0.1", port: 3306, database: "noamany_final_new" }`.

- [ ] **Step 1: Confirm the redacted target identity**

Run a Node read-only check that parses `DATABASE_URL` and prints only protocol, host, port, and database.

Expected: `mysql:`, `127.0.0.1`, `3306`, and `noamany_final_new`.

- [ ] **Step 2: Stop only the local Nest process connected to this test database**

Identify the process listening on the local backend port and stop it before schema reset. Do not stop MySQL/XAMPP.

Expected: no local backend process retains active connections to `noamany_final_new`.

- [ ] **Step 3: Export the database with `C:\xampp\mysql\bin\mysqldump.exe`**

Use a temporary protected MySQL defaults file derived from `.env`, write the dump to `.migration-backups/noamany_final_new-<timestamp>.sql`, and remove the temporary credentials file after the dump finishes.

Expected: command succeeds and the dump size is greater than zero bytes.

- [ ] **Step 4: Verify the backup checkpoint**

Run a file-size check and record the output path without displaying dump contents.

Expected: one readable, non-empty SQL backup exists.

### Task 2: Reset the disposable test schema

**Files:**
- Read: `.migration-backups/noamany_final_new-<timestamp>.sql`
- Read/write: MySQL schema `noamany_final_new`

**Interfaces:**
- Consumes: verified backup from Task 1 and the exact target identity.
- Produces: an empty `noamany_final_new` schema ready for the baseline migration.

- [ ] **Step 1: Reconfirm the backup and target immediately before reset**

Expected: backup is non-empty; target still resolves to `127.0.0.1:3306/noamany_final_new`.

- [ ] **Step 2: Drop and recreate only `noamany_final_new`**

Use the local MySQL client with the same protected temporary credentials mechanism. Execute `DROP DATABASE` followed by `CREATE DATABASE` using the database's existing charset/collation defaults.

Expected: the database exists, contains no application tables, and has no prior `_prisma_migrations` ledger.

- [ ] **Step 3: Verify Prisma can connect to the empty schema**

Run `npx prisma validate --schema prisma/schema.prisma` and a minimal Prisma connection query.

Expected: Prisma schema validation passes and MySQL is reachable.

### Task 3: Execute the foundation batch

**Files:**
- Read: `backend/prisma/migrations/00000000000000_baseline/migration.sql`
- Read: migrations sorted from `00000000000000_baseline` through `20260707180000_gym_policies_allow_refunds`

**Interfaces:**
- Consumes: empty schema from Task 2.
- Produces: 13 finished migration ledger rows.

- [ ] **Step 1: Enumerate the 13 migration directories in lexicographic order**

Expected: first is `00000000000000_baseline`; last is `20260707180000_gym_policies_allow_refunds`.

- [ ] **Step 2: For each migration, execute SQL then mark it applied**

Run `npx prisma db execute --file prisma/migrations/<name>/migration.sql --schema prisma/schema.prisma`; only when it succeeds run `npx prisma migrate resolve --applied <name> --schema prisma/schema.prisma`.

Expected: each migration yields one successful SQL result followed by one finished ledger row.

- [ ] **Step 3: Verify foundation state**

Query `_prisma_migrations` and perform a Prisma connection query.

Expected: exactly 13 finished rows; no failed or rolled-back rows.

### Task 4: Execute operational batch A

**Files:**
- Read: migrations sorted from `20260708120000_member_mobile_api` through `20260729160000_user_legacy_mapping`

**Interfaces:**
- Consumes: 13 completed migrations from Task 3.
- Produces: 66 finished migration ledger rows.

- [ ] **Step 1: Enumerate the 53 migrations and validate their boundaries**

Expected: first `20260708120000_member_mobile_api`, last `20260729160000_user_legacy_mapping`, count 53.

- [ ] **Step 2: Execute and resolve each migration in order**

Use the exact SQL-then-resolve sequence from Task 3. Treat data-write, backfill, cleanup, and repair migrations as single-migration checkpoints.

Expected: no later migration starts after a failure.

- [ ] **Step 3: Verify operational batch A**

Expected: exactly 66 finished ledger rows; Prisma can query the database; backend health is checked once the API is restarted.

### Task 5: Execute operational batch B

**Files:**
- Read: migrations sorted from `20260802130000_legacy_import_audit` through `20260813222000_portal_content_items`

**Interfaces:**
- Consumes: 66 completed migrations from Task 4.
- Produces: 91 finished migration ledger rows.

- [ ] **Step 1: Enumerate the 25 migrations and validate their boundaries**

Expected: first `20260802130000_legacy_import_audit`, last `20260813222000_portal_content_items`, count 25.

- [ ] **Step 2: Execute and resolve each migration in order**

Use SQL-then-resolve. After migrations named `backfill`, `legacy`, `replace`, or `repair`, query the ledger before continuing.

Expected: migration count increases one at a time and no failed ledger row is present.

- [ ] **Step 3: Verify operational batch B**

Expected: exactly 91 finished ledger rows and a successful Prisma connection query.

### Task 6: Execute operational batch C

**Files:**
- Read: migrations sorted from `20260814110000_dashboard_performance_indexes` through `20260830090000_trainer_performance_analytics`

**Interfaces:**
- Consumes: 91 completed migrations from Task 5.
- Produces: 101 finished migration ledger rows.

- [ ] **Step 1: Enumerate the 10 migrations and validate their boundaries**

Expected: first `20260814110000_dashboard_performance_indexes`, last `20260830090000_trainer_performance_analytics`, count 10.

- [ ] **Step 2: Execute and resolve the batch sequentially**

Expected: every migration has matching successful SQL execution and ledger record.

- [ ] **Step 3: Verify operational batch C**

Expected: exactly 101 finished ledger rows and no rolled-back migration.

### Task 7: Execute the final migration batch and validate the application

**Files:**
- Read: migrations sorted from `20260917110000_add_employee_id_to_inventory_reports` through `20260925194500_daily_closing_target_dimensions`
- Read: `backend/package.json`

**Interfaces:**
- Consumes: 101 completed migrations from Task 6.
- Produces: 122 finished migration ledger rows, generated Prisma Client, and a healthy backend API.

- [ ] **Step 1: Enumerate the 21 final migrations and validate their boundaries**

Expected: first `20260917110000_add_employee_id_to_inventory_reports`, last `20260925194500_daily_closing_target_dimensions`, count 21.

- [ ] **Step 2: Execute and resolve all 21 migrations in order**

Expected: the ledger reaches exactly 122 finished rows.

- [ ] **Step 3: Regenerate and validate Prisma**

Run `npm run prisma:generate` then `npm run prisma:validate` from `backend`.

Expected: both commands succeed.

- [ ] **Step 4: Run backend verification**

Run `npm run typecheck`; start the production build or an equivalent local backend process; request `GET /api/health`.

Expected: typecheck succeeds and health returns HTTP 200 with a healthy result.

- [ ] **Step 5: Perform final database verification**

Query `_prisma_migrations` for total, failed, and rolled-back rows.

Expected: `total = 122`, `failed = 0`, and `rolledBack = 0`.
