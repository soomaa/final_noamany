# Online Branch Demo Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed the local demo database with the four branches from the online dashboard and ensure reruns retain valid branch-linked operational data.

**Architecture:** Foundation owns the authoritative four-name fixture and existing domain modules continue loading generated IDs through `getBranchIds()`. GymSales clears its child supplier phones before supplier IDs are reset. Fresh database queries audit the post-seed branch identity and operational references.

**Tech Stack:** TypeScript, Prisma 5, ts-node, MySQL.

**Spec:** `docs/superpowers/specs/2026-09-26-online-branch-demo-seed-design.md`

## Global Constraints

- Use only the local test database; never contact the online dashboard database.
- Exact branch names and order are those in the spec.
- Seed modules must load generated IDs through `getBranchIds()`; no hard-coded generated IDs.
- Keep global tables global when their schema has no branch relation.
- Add no migration and do not reset the migration ledger.
- Follow RED → GREEN verification for every production-code change.

## Review Focus

- Rerunning the seed must clear `inv_supplier_phones` before resetting supplier IDs.
- A branch name typo or reordered fixture must fail the post-seed branch identity query.
- Existing seed modules must still receive all generated branch IDs rather than a fixed ID.
- Operational rows with `branch_id` or `branch_id_fk` must not point outside `tbl_branches`.
- Global catalog rows with a nullable branch field may legitimately remain `NULL`.

---

### Task 1: Correct the online branch fixture and cleanup order

**Files:**
- Modify: `backend/prisma/seed/00-foundation.ts:115-155`
- Modify: `backend/prisma/seed/30-gymsales.ts:20-51`

**Interfaces:**
- Produces: four foundation branches and child-first GymSales cleanup on every seed run.

- [ ] **Step 1: Reproduce the failing seed**

Run the full local seed with operational demo data. The existing failed run leaves supplier-phone child rows while the parent table is cleared.

- [ ] **Step 2: Verify the failure is the known root cause**

Run: `$env:SEED_OPERATIONAL_DEMO='true'; npm run db:seed`
Expected: FAIL at `inv_supplier_phones_supplier_id_phone_key`, proving the parent/child cleanup-order defect.

- [ ] **Step 3: Implement the smallest corrective changes**

Replace Foundation's seven placeholder branch definitions with the exact four names in the spec. Add `inv_supplier_phones` directly before `inv_suppliers` in GymSales cleanup. Do not alter generated-ID loading in other seed modules.

- [ ] **Step 4: Run the seed to verify the repair**

Run: `$env:SEED_OPERATIONAL_DEMO='true'; npm run db:seed`
Expected: all existing seed modules complete without a supplier-phone uniqueness error.

### Task 2: Audit local branch-linked data

**Files:**
- No source changes required.

**Interfaces:**
- Consumes: local Prisma connection and the exact branch list in the spec.
- Produces: fresh database evidence for branch identity, non-orphan branch links, and administrator access.

- [ ] **Step 1: Verify branch identity and operational references**

Run read-only MySQL/Prisma queries for exact `tbl_branches` names and orphan checks in employees, users, club, GymSales, POS, and accounting. Every non-null branch reference must exist in `tbl_branches`.

- [ ] **Step 2: Verify administrator authentication and schema validity**

Run `npm run prisma:validate`, then perform a local login request using the existing admin demo credential without printing it in logs.
Expected: Prisma exits 0 and authentication returns success.

## Self-review

- Spec coverage: Task 1 locks the online names and cleanup ordering through the actual seed; Task 2 verifies the resultant branch set, operational links, and admin access.
- Shared interface check: the existing `getBranchIds()` loader carries the foundation output into every domain seed module.
- No migration is introduced and no online system is mutated.
