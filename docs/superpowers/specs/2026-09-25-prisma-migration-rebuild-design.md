# Safe Prisma migration rebuild for the test database

## Goal

Bring the test database's Prisma migration history into a fully applied, reproducible state. The database currently records five of 122 migrations, leaving 117 historical migrations unrecorded. Existing database contents are explicitly test data and may be replaced.

## Constraints and success criteria

- Preserve a recoverable database snapshot before destructive work.
- Do not use a one-shot `prisma migrate deploy` against the drifted database.
- Apply migrations in ordered, verifiable batches and stop on the first failure.
- After every batch, verify Prisma's migration ledger, schema availability, and backend health.
- End with all 122 migrations applied and a backend that starts and responds to health checks.

## Chosen approach

Create a backup, rebuild the test database from an empty schema, and run the existing migrations in chronological batches. A clean rebuild is safer than trying to infer whether each old migration has already partially affected the untracked schema, especially because the baseline migration is not recorded.

## Execution stages

1. **Safety checkpoint** — record the active database identity and create an SQL backup. Validate that the target is the configured test database, never a production connection.
2. **Reset checkpoint** — remove the test schema only after the backup succeeds; recreate an empty schema using the same database and connection settings.
3. **Foundation batch** — apply the baseline and earliest reference-data migrations; check Prisma's migration table and essential tables.
4. **Operational batches** — apply chronological batches grouped by dependency area: club/subscriptions, HR/attendance, cafe/POS/inventory, finance/RBAC, then portal/mobile.
5. **Data-transform batches** — run migrations containing seed, backfill, repair, replacement, or cleanup SQL only after their prerequisite schema batch succeeds. They remain ordered and are checked individually if one fails.
6. **Finalization** — regenerate Prisma Client, run backend type/build validation feasible in the environment, start or health-check the API, and report the final migration count.

## Migration rules

- Migrations are executed in their directory timestamp order.
- A batch is not marked complete until `prisma migrate status` and direct database checks agree.
- Any failure stops the run. The backup stays available; no later batch is attempted.
- No migration files or application schema are altered merely to make a migration pass. A failure is diagnosed against the target schema and reported before a corrective change is considered.
- The current five resolved migrations are not replayed outside the clean rebuild; the rebuilt migration ledger is the authority.

## Verification

For every batch:

- Count finished rows in `_prisma_migrations` and compare it with the expected cumulative count.
- Confirm the database is reachable through Prisma.
- Check the backend health endpoint after dependency-bearing batches and after finalization.

Final acceptance requires 122 finished migrations, no failed or rolled-back migration rows, successful Prisma Client generation, and a healthy backend API.

## Recovery

If reset or any batch fails, stop immediately. The SQL backup made in the safety checkpoint is the recovery source. Restoring it is a separate deliberate operation, never automatic.
