# Online Branch Demo Seed Design

## Goal

Make the local demo database use the four branches visible in the authenticated online dashboard, then fill the existing demo domains with coherent rows that reference only those branches.

## Authoritative branch set

The online dashboard on 2026-09-26 showed exactly these branches:

1. `فرع طنطا`
2. `فرع البر الشرقي- شبين الكوم`
3. `فرع الجلاء- شبين الكوم`
4. `فرع طنطا الفرعي`

The local seed must create these four names in this order. Their generated IDs are local implementation details; seed modules must obtain them through `getBranchIds()` rather than hard-code IDs.

## Scope

- Replace the seven placeholder branch definitions in the foundation seed with the authoritative four-branch set.
- Keep existing seed modules branch-agnostic by reusing their `getBranchIds()` loader.
- Repair GymSales cleanup ordering by clearing `inv_supplier_phones` before `inv_suppliers`; this fixes deterministic reruns that otherwise fail on the supplier-phone unique key.
- Seed the existing demo modules using the operational-data option so their screens contain data.
- Verify branch names, the absence of orphan branch references in the seeded operational tables, and the `admin` login.

## Non-goals

- No production database is contacted or modified.
- Global lookup/settings tables are not artificially assigned a branch where the schema has no branch relationship.
- No database migration is created: this changes fixture data and cleanup order only.
- No attempt is made to fabricate rows for every legacy table outside the existing full demo-seed contract.

## Safety and acceptance criteria

- The target remains the local test database already selected for this workspace.
- `npm run db:seed` is rerunnable without a `P2002` supplier-phone conflict.
- Foundation creates four branches with the exact names above.
- All branch-scoped rows created by the existing seed use IDs from `tbl_branches`.
- The seeded `admin` account authenticates with the documented local demo credential.
- Prisma schema validation and focused fixture tests pass. Existing unrelated typecheck failures are reported separately rather than masked.
