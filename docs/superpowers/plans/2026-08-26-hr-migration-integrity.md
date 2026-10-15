# HR Migration Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a canonical, non-destructive, repeatable Prisma migration path and executable gates that prove history and schema safety.

**Architecture:** Restore three verified migration artifacts, introduce a dry-run-first migration history doctor for the one exact legacy alias, guard `db push`, and add disposable-database rehearsals plus drift/destructive-diff gates. Current business data is never used for mutating tests.

**Tech Stack:** Node.js 24, TypeScript 5.7, NestJS 11, Prisma 5.22, MySQL/InnoDB, Jest 30, Node test runner for deployment scripts.

**Spec:** `docs/superpowers/specs/2026-08-26-hr-migration-integrity-design.md`

## Global Constraints

- Preserve all pre-existing uncommitted backend and frontend changes.
- Do not run `prisma db push`, `prisma migrate reset`, destructive DDL, seed, or metadata repair against `one80_hr` during development.
- Every metadata mutation must first archive the exact row and require `MIGRATION_REPAIR_BACKUP_ID`.
- Never log `DATABASE_URL`, database passwords, tokens, or business row contents.
- No migration may drop a table, column, or index in this package.
- Every production-code behavior begins with a failing test and a verified red state.

---

### Task 1: Restore the three canonical applied migration artifacts

**Files:**
- Create: `backend/prisma/migrations/20260709100000_hot_path_indexes/migration.sql`
- Create: `backend/prisma/migrations/20260809213000_fix_monthly_twelve_session_validity/migration.sql`
- Create: `backend/prisma/migrations/20260810120000_reception_gender_filter_indexes/migration.sql`
- Test: `backend/scripts/migration-artifacts.test.mjs`

**Interfaces:**
- Consumes: the SHA-256 values recorded in the design evidence.
- Produces: a canonical local file for every non-duplicate database-applied migration.

- [x] **Step 1: Write the failing artifact test**

```js
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const expected = new Map([
  ['20260709100000_hot_path_indexes', '11b302b5de444f7f5a865edc8155fe614b9d34e02b16bfb405b4e67de907b0d4'],
  ['20260809213000_fix_monthly_twelve_session_validity', '771a429b863cc297ce2406769363f90414d601e0e4e57a343cd70c89dc048004'],
  ['20260810120000_reception_gender_filter_indexes', 'c077c4c9755b1c3e4e734cee3985b2abc19d5c03b62738e6ad4a6dbaf8fed2ff'],
]);

test('canonical migration artifacts retain their verified database-applied content', async () => {
  for (const [name, digest] of expected) {
    const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url));
    assert.equal(createHash('sha256').update(sql).digest('hex'), digest);
  }
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `node --test scripts/migration-artifacts.test.mjs` from `backend`.  
Expected: FAIL with `ENOENT` for the first missing canonical artifact.

- [x] **Step 3: Restore exact verified contents**

Use the matching files under `one80 desktop/backend/prisma/migrations/` as byte-for-byte sources. Do not edit their SQL.

- [x] **Step 4: Run the test and verify GREEN**

Run: `node --test scripts/migration-artifacts.test.mjs`.  
Expected: 1 test, 0 failures.

### Task 2: Implement pure migration-history classification

**Files:**
- Create: `backend/src/common/migrations/migration-history-policy.ts`
- Test: `backend/src/common/migrations/migration-history-policy.spec.ts`

**Interfaces:**
- Produces: `classifyHistory(localNames: Set<string>, appliedNames: Set<string>): HistoryClassification` and `assertRepairableLegacyAlias(input: LegacyAliasEvidence): void`.
- Consumes: no database connection; callers supply literal evidence.

- [x] **Step 1: Write failing policy tests**

Tests use literal sets and require: the exact `20260707145000_hr_employment_type` alias is repairable only when `20260707140000_hr_job_titles_members` is local and applied; unknown database-only names throw; unresolved names throw; local pending names remain reported and are never auto-resolved.

- [x] **Step 2: Verify RED**

Run: `npm test -- migration-history-policy.spec.ts --runInBand`.  
Expected: FAIL because the policy module does not exist.

- [x] **Step 3: Implement minimal pure policy**

```ts
export const LEGACY_ALIAS = '20260707145000_hr_employment_type';
export const CANONICAL_REPLACEMENT = '20260707140000_hr_job_titles_members';

export interface HistoryClassification {
  localPending: string[];
  databaseOnly: string[];
  repairableAliases: string[];
  unknownDatabaseOnly: string[];
}
```

Classification sorts all arrays and treats no alias other than `LEGACY_ALIAS` as repairable.

- [x] **Step 4: Verify GREEN and mutation resistance**

Run the focused Jest file. Then temporarily reason through changing the alias or replacement: at least one literal test must fail.

### Task 3: Add the dry-run-first history doctor

**Files:**
- Create: `backend/src/common/migrations/migration-history-doctor.ts`
- Create: `backend/src/common/migrations/migration-history-doctor.spec.ts`
- Create: `backend/prisma/scripts/migration-history-doctor.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `DATABASE_URL`; optional `--apply`; required-on-apply `MIGRATION_REPAIR_BACKUP_ID`.
- Produces: exit 0 for clean or safely repairable dry-run, exit 2 for unknown drift, and one archived metadata row before exact legacy deletion on apply.

- [x] **Step 1: Write failing service tests**

Tests inject a database port with methods `listLocal`, `listApplied`, `hasColumn`, `hasIndex`, `isApplied`, `archiveAndDeleteLegacy`. They prove dry-run makes zero writes, unknown names make zero writes and throw, missing `employees.employment_type` refuses apply, missing `idx_club_members_created_by` refuses apply, missing backup ID refuses apply, and valid apply invokes one atomic archive/delete call for the exact alias.

- [x] **Step 2: Verify RED**

Run: `npm test -- migration-history-doctor.spec.ts --runInBand`.  
Expected: FAIL because the doctor does not exist.

- [x] **Step 3: Implement the doctor and MySQL adapter**

The adapter uses parameterized Prisma `$queryRaw` for reads and `$transaction` with an archive-table `CREATE TABLE IF NOT EXISTS`, `INSERT ... SELECT`, row-count assertion, and exact `DELETE ... WHERE migration_name = ?`. It never accepts a migration name from CLI input.

- [x] **Step 4: Add scripts**

```json
"prisma:history:doctor": "tsx prisma/scripts/migration-history-doctor.ts",
"prisma:history:repair": "tsx prisma/scripts/migration-history-doctor.ts --apply"
```

- [x] **Step 5: Verify GREEN**

Run both focused Jest files and `npm run typecheck`.

### Task 4: Guard Prisma push and add destructive-diff checks

**Files:**
- Create: `backend/prisma/scripts/guarded-db-push.mjs`
- Create: `backend/prisma/scripts/guarded-db-push.test.mjs`
- Create: `backend/prisma/scripts/check-schema-drift.mjs`
- Create: `backend/prisma/scripts/check-schema-drift.test.mjs`
- Modify: `backend/package.json`
- Modify: `backend/DEPLOY.md`

**Interfaces:**
- `guarded-db-push.mjs` executes push only when `ALLOW_PRISMA_DB_PUSH=local-only`, `NODE_ENV` is not production, and the parsed database name ends in `_dev` or `_e2e`.
- `check-schema-drift.mjs` runs Prisma diff, parses statements, and exits 2 on any drift and 3 on destructive statements while redacting datasource URLs.

- [x] **Step 1: Write failing Node tests**

Use injected command runners. Literal cases prove production refusal, `one80_hr` refusal, `_dev` allowance, `_e2e` allowance, no credential output, and classification of `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`, and `DROP FOREIGN KEY` as destructive.

- [x] **Step 2: Verify RED**

Run: `node --test prisma/scripts/guarded-db-push.test.mjs prisma/scripts/check-schema-drift.test.mjs`.  
Expected: FAIL because both modules are missing.

- [x] **Step 3: Implement minimal scripts and replace package commands**

```json
"prisma:push": "node prisma/scripts/guarded-db-push.mjs",
"prisma:drift:check": "node prisma/scripts/check-schema-drift.mjs"
```

Replace `db:reseed` with a guarded script that requires the same local-only conditions before `--force-reset`.

- [x] **Step 4: Verify GREEN and current-database refusal**

Run the Node tests, then run `npm run prisma:push` without the opt-in. Expected: non-zero refusal before Prisma executes.

### Task 5: Reconcile Prisma schema with retained live objects

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/schema-retained-objects.md`
- Test: `backend/prisma/scripts/check-schema-drift.test.mjs`

**Interfaces:**
- Consumes: `prisma db pull --print` output from the current database and code-usage searches.
- Produces: a schema that represents retained live columns, indexes, foreign keys, and tables without generating destructive DDL.

- [x] **Step 1: Capture the failing drift evidence**

Run: `npm run prisma:drift:check`.  
Expected: exit 3 and a redacted summary containing 25 table drops and 36 index drops.

- [x] **Step 2: Classify every drift object**

For each object, record one literal disposition in `schema-retained-objects.md`: active model, retained ignored legacy model, or separately approved future retirement. Package A permits only the first two.

- [x] **Step 3: Add the minimal Prisma representation**

Merge introspected fields and mapped indexes into existing models. Add retained legacy tables as mapped `@@ignore` models so Prisma represents them but client APIs are not exposed. Do not replace the schema wholesale.

- [x] **Step 4: Verify schema and non-destructive progress**

Run `npx prisma format`, `npx prisma validate`, `npx prisma generate`, and `npm run prisma:drift:check`. The diff may shrink incrementally, but no new destructive statement is accepted; continue until exit 0.

### Task 6: Disposable MySQL migration rehearsal

**Files:**
- Create: `backend/src/common/migrations/migration-rehearsal-policy.ts`
- Create: `backend/src/common/migrations/migration-rehearsal-policy.spec.ts`
- Create: `backend/prisma/scripts/migration-rehearsal.ts`
- Create: `backend/scripts/migration-rehearsal-cli.test.mjs`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: a MySQL admin URL via `E2E_MYSQL_ADMIN_URL` and generates database names matching `one80_hr_e2e_<hex>`.
- Produces: fresh-install and current-snapshot-upgrade results; drops only the exact generated database in a `finally` block.

- [x] **Step 1: Write failing naming/safety tests**

Tests prove generated names match `^one80_hr_e2e_[a-f0-9]{16}$`, cleanup refuses any other name, and credentials are redacted from logs.

- [x] **Step 2: Verify RED**

Run the focused Jest file. Expected: module missing.

- [x] **Step 3: Implement rehearsal orchestration**

Fresh path: create DB → `prisma migrate deploy` → `prisma validate` → integrity probes. Upgrade path: restore a sanitized schema fixture → run history doctor dry-run/apply with a generated backup acknowledgment → migrate deploy → diff check.

- [x] **Step 4: Verify unit and integration paths**

Run focused unit tests. If `E2E_MYSQL_ADMIN_URL` is available, run `npm run prisma:rehearse`; otherwise the integration command must report `SKIP` without claiming success.

### Task 7: Package A verification

**Files:**
- Modify: `HR_REFERENCE_FULL_AUDIT_2026-08-26.md` only to append verified resolution evidence after all commands pass.

**Interfaces:**
- Produces: reproducible evidence for Package A; does not change scores until all mandatory gates pass.

- [x] **Step 1: Run focused suites**

Run all migration policy/doctor/guard/rehearsal tests with zero failures.

- [x] **Step 2: Run backend regression gates**

Run `npm run typecheck`, `npm test -- --runInBand`, `npx prisma validate`, and `npx prisma migrate status` against the disposable database.

- [x] **Step 3: Run drift and fresh/upgrade evidence**

Require drift exit 0 and both disposable rehearsal paths to pass. If the current database has not yet had the archived metadata repair applied, report that exact remaining state rather than marking Package A complete.

- [x] **Step 4: Update the master plan**

Mark Package A complete only after every command above has current output and no unapproved destructive statement remains.
