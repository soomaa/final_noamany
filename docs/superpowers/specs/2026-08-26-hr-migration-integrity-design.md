# HR Migration Integrity — Design

**Parent:** `docs/superpowers/specs/2026-08-26-hr-reference-100-design.md`  
**Scope:** Package A only. No HR business behavior and no current business rows are changed.

## 1. Current facts

- Active backend has 74 local migration directories.
- The current database records four applied migration names missing locally.
- Three of those migrations have identical source copies in other project artifacts:
  - `20260709100000_hot_path_indexes`
  - `20260809213000_fix_monthly_twelve_session_validity`
  - `20260810120000_reception_gender_filter_indexes`
- `20260707145000_hr_employment_type` is byte-identical in intent to the canonical local `20260707140000_hr_job_titles_members`; applying both to a fresh database would duplicate a column and index.
- The database-to-schema diff currently contains 25 table drops and 36 index drops. No drop is authorized by this package.

## 2. Chosen approach

Use a canonical-history repair with explicit evidence:

1. Restore the three genuine, non-duplicate applied migrations byte-for-byte from the verified copies.
2. Keep the duplicate legacy migration out of the canonical local migration chain.
3. Add a migration-history doctor with a dry-run default. It recognizes only the exact legacy alias, verifies that the canonical replacement is applied, verifies the expected column and index, archives the legacy `_prisma_migrations` row into `one80_migration_history_archive`, then deletes only that one metadata row when `--apply` is supplied.
4. Make the doctor refuse unknown database-only migrations, missing objects, checksum mismatches, unresolved migrations, or production apply without a fresh backup acknowledgment.
5. Add read-only schema drift and destructive-diff checks. The drift remains failing until the live schema is represented or intentionally retired in a later reviewed migration; no current table is dropped to make the check green.
6. Replace direct `prisma:push` exposure with a guarded local-only script; production deploy continues to use `prisma migrate deploy`.
7. Rehearse history repair, fresh migration, and upgrade migration on disposable MySQL databases before applying metadata cleanup to the current database.

## 3. Safety model

- Dry-run is the default and performs no writes.
- `--apply` requires `MIGRATION_REPAIR_BACKUP_ID` and refuses an empty value.
- The exact database name is printed; credentials are never printed.
- The archive table stores the original migration row before deletion and uses the migration ID as a unique key.
- The tool never deletes migration directories, tables, columns, indexes, business rows, or unknown migration metadata.
- The current database is not modified until the disposable-database rehearsal passes.

## 4. Drift ownership

Schema drift is classified into:

- **Missing canonical history:** fixed in this package.
- **Live indexes absent from Prisma schema:** represented in Prisma with `@@index(..., map: ...)` where the model exists.
- **Live legacy tables absent from Prisma schema:** introspected and represented with `@@ignore` where they must be retained, or retired only by a later explicit migration with backup and impact proof.
- **Live columns absent from Prisma schema:** represented and typed before any destructive operation is permitted.

The end-state check is `prisma migrate diff --exit-code = 0`; merely suppressing the check is not accepted.

## 5. Verification

- Unit tests for history classification and safety preconditions.
- CLI integration test against a disposable migration metadata database.
- `prisma validate` and generate.
- `migrate status` with no local/database-only differences after rehearsal.
- schema diff with no unapproved `DROP TABLE`, `DROP COLUMN`, or `DROP INDEX` at every intermediate step.
- fresh install and upgrade fixture both succeed.

