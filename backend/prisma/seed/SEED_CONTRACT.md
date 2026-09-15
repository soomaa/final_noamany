# Demo Seed — Module Contract (read fully before writing code)

We are building a **comprehensive demo dataset** so every page of the Noamany Fitness Center app shows
realistic, coherent data. The **foundation is already seeded** in the live DB
(`noamany_hr`): branches, departments (`hr_edarat_aqsam`), job titles (`department_jobs`),
banks, `employees` (~36, Arabic names, `emp_code` 1001+), and `users` (login accounts).
**Do not reseed or clear foundation tables.** RBAC (`rbac_*`) is seeded separately — never touch it.

## Your module

Create `prisma/seed/<NN>-<name>.ts` exporting `export async function seed<Name>(): Promise<void>`.

```ts
/* eslint-disable no-console */
import {
  prisma, clearTables, log, randInt, pick, pickN, chance, round2,
  getBranches, getBranchIds, getEmployees, getUsers, getDepartments, getJobs,
  BASE, addDays, daysFromBase, ymd, dmy, ymdhms, hms,
  AR_MALE, AR_FEMALE, AR_FAMILY, fullNameMale, fullNameFemale, phone,
} from './_shared';

export async function seed<Name>(): Promise<void> {
  console.log('▶ <Name>…');
  await clearTables([ /* ONLY your tables, CHILDREN FIRST */ ]);

  const branches = await getBranchIds();
  const employees = await getEmployees(); // {id, emp_code, employee, branch_id_fk, emp_type, basic_salary, phone}
  // ... insert rows ...

  log('<name>', `members: N, ...`);
  console.log('✔ <Name> done');
}

// self-run for standalone testing
if (require.main === module) {
  seed<Name>()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
```

## Hard rules

1. **Import the shared `prisma`** from `./_shared`. Never `new PrismaClient()`.
2. **Field names == DB column names** (snake_case, no camelCase renaming). Your authoritative
   field reference is:
   - `scratchpad/columns.txt` — lines `table|column|nullable(NO/YES)|type|default(<none>)|extra`
   - `scratchpad/required_cols.txt` — `table|column|type` for every NOT-NULL, no-default,
     non-auto-increment column. **You MUST supply every one of these for each row.**
   The scratchpad dir is:
   `/private/tmp/claude-501/-Users-fatmaatefkasem-Desktop-nomany-hr-GYM/b28539f7-97bb-4950-a251-05b4835b0286/scratchpad`
3. **Enums**: use exact values from the `enum X { ... }` blocks in `prisma/schema.prisma`
   (legacy stores literals like `yes`/`no`, `Aktif`). Grep the schema for the enum name.
4. **Types**: VARCHAR date columns (very common in legacy tables — schema comments say
   `// date-string`) take **strings** via `ymd()/dmy()/ymdhms()`. `DateTime` columns take JS
   `Date` (e.g. `BASE`, `addDays(BASE,-30)`). `BigInt` columns need `BigInt(n)`. `Decimal`
   accepts a plain number. `@id` without `@default(autoincrement())` (rare) must be supplied.
5. **Make pages non-empty**: for each page/endpoint in your scope, open the backend
   service (`src/modules/<feature>/*.service.ts`) and read the `where`/filter/`orderBy`/
   soft-delete conditions of its list query. Seed rows that SATISFY those filters (correct
   status/enum values, not-soft-deleted) so the list actually renders. This is the whole point.
6. **Volume**: primary list tables → **8–20 rows**; settings/lookup tables → the handful the
   UI expects; detail/child tables → enough to make parents meaningful; history/audit → a few.
7. **Coherence**: link to real `employees.id`/`emp_code`, `tbl_branches.branch_id`,
   `users.user_id` from the loaders. Use Arabic names/titles. Keep money in SAR, sensible dates
   around `BASE` (2026-07-01), statuses spread across the enum (active/pending/expired/etc.).
8. **Idempotent**: `clearTables([...])` at the top clears only YOUR tables (children first).
9. **Scope discipline**: only create/clear tables in YOUR assigned list. Do not edit
   `_shared.ts`, `package.json`, other modules, or the schema.
10. **Test before finishing**: run `npx ts-node prisma/seed/<NN>-<name>.ts` from the backend
    dir; fix every error until it completes; then confirm row counts with
    `mysql -u root -N -e "SELECT COUNT(*) FROM noamany_hr.<table>;"`. Prisma validates field
    names/types/enums at runtime, so a clean run means your fields are correct.

## Tips
- Prisma Client is generated; models are named exactly like the DB tables (snake_case).
- `create` in a loop is fine; use `createMany` for large child sets (note: `createMany`
  skips relations and returns no ids — use `create` when you need the id downstream).
- If a table's purpose is unclear, grep the backend for its model name to see how it's read.
- Money/qty on Decimal columns: pass numbers; use `round2()`.
- Reuse the deterministic RNG (`randInt/pick/chance`) so re-runs are stable.
