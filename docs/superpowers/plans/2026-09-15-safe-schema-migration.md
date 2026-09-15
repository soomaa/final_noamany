# Safe Schema Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add database objects declared in `backend/prisma/schema.prisma` but missing from the existing local MySQL database, without dropping existing customer data or objects.

**Architecture:** The database has 101 source migrations but no `_prisma_migrations` history, so running `prisma migrate dev` or `prisma migrate deploy` directly would start at the baseline and attempt to recreate existing tables. Establish the current database as the migration baseline in metadata only, then apply one new additive migration containing only missing tables, columns, indexes, and foreign keys. Exclude all DROP operations and no reset command may be used.

**Tech Stack:** Prisma 5.22, MySQL 8, Node.js 24, NestJS.

**Spec:** User request in this Codex thread: create the missing database migrations so `npm run start:dev` can use the current schema.

## Global Constraints

- Never run `prisma migrate reset`, `prisma db push --force-reset`, or any destructive SQL.
- Create and verify a timestamped SQL backup before schema writes.
- Preserve pre-existing tables and columns even when Prisma reports them as removed.
- Do not expose database credentials in logs or migration files.
- Keep `backend/.env` development port at `4000` so the Vite frontend proxy continues to work.

---

### Task 1: Capture a recoverable backup and schema-drift baseline

**Files:**
- Create: `backend/backups/noamany_final_new-before-20260915-schema-sync.sql.gz`
- Read: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: `DATABASE_URL` from `backend/.env`.
- Produces: a recoverable MySQL dump and a read-only Prisma diff used to determine additive SQL.

- [ ] **Step 1: Confirm the database is reachable and list the current target objects.**

Run:

```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

Expected: missing schema objects are listed; no database mutation occurs.

- [ ] **Step 2: Create a compressed database backup.**

Run `mysqldump` using credentials resolved from `DATABASE_URL`, writing the dump under `backend/backups`.

- [ ] **Step 3: Verify the backup is non-empty and can be decompressed.**

Run:

```powershell
gzip -t backend/backups/noamany_final_new-before-20260915-schema-sync.sql.gz
```

Expected: exit code 0.

### Task 2: Create an additive migration for schema objects absent from MySQL

**Files:**
- Create: `backend/prisma/migrations/20260915120000_add_missing_schema_objects/migration.sql`
- Read: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: the database-to-schema diff from Task 1.
- Produces: an SQL migration that only creates missing tables and adds required columns, indexes, and foreign keys.

- [ ] **Step 1: Produce the raw Prisma SQL diff without applying it.**

Run:

```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

Expected: SQL includes `CREATE TABLE` and `ALTER TABLE` statements for missing schema objects.

- [ ] **Step 2: Write the migration with only additive statements.**

Include `CREATE TABLE`, `ADD COLUMN`, `ADD INDEX`, and `ADD CONSTRAINT` statements needed by the current schema. Exclude every `DROP TABLE`, `DROP COLUMN`, and `DROP FOREIGN KEY` statement.

- [ ] **Step 3: Verify the migration has no destructive DDL.**

Run:

```powershell
rg -n 'DROP\\s+(TABLE|COLUMN|INDEX|FOREIGN)' prisma/migrations/20260915120000_add_missing_schema_objects/migration.sql
```

Expected: no matches.

### Task 3: Baseline migration history and apply the additive migration

**Files:**
- Modify: MySQL `_prisma_migrations` metadata only.
- Apply: `backend/prisma/migrations/20260915120000_add_missing_schema_objects/migration.sql`

**Interfaces:**
- Consumes: backup from Task 1 and validated migration from Task 2.
- Produces: a migration history matching the repository and a database with the missing current-schema objects.

- [ ] **Step 1: Record every existing repository migration as applied.**

For each existing directory under `prisma/migrations`, run:

```powershell
npx prisma migrate resolve --applied <migration-directory-name>
```

Expected: migration history is recorded without executing its SQL.

- [ ] **Step 2: Apply only the new additive migration.**

Run:

```powershell
npx prisma migrate deploy
```

Expected: only `20260915120000_add_missing_schema_objects` is executed.

- [ ] **Step 3: Verify the original missing tables now exist.**

Run a read-only `information_schema.tables` query for `cafe_waste_records`, `cafe_waste_reasons`, and `inv_product_packages`.

Expected: all are present.

### Task 4: Regenerate Prisma and prove the development stack works

**Files:**
- Read: `backend/package.json`

**Interfaces:**
- Consumes: updated MySQL schema and Prisma migration history.
- Produces: generated Prisma client and a healthy local API.

- [ ] **Step 1: Regenerate the Prisma client while the backend process is stopped.**

Run:

```powershell
npx prisma generate
```

Expected: exit code 0; no Windows file-lock error.

- [ ] **Step 2: Run TypeScript verification.**

Run:

```powershell
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Start the API and test both direct and proxied health routes.**

Run:

```powershell
npm run start:dev
```

Then verify HTTP 200 from `http://localhost:4000/api/health` and `http://localhost:5173/api/health`.

