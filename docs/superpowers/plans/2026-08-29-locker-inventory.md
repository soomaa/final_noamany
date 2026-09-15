# Locker Branch Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate locker data by branch and let staff submit per-locker inventory reports with notes for later review.

**Architecture:** Locker list, statistics, details, and mutations receive the authenticated user and apply `BranchScopeService` to `main_branch_id`. A new inventory-report header and item table record a snapshot of every locker in one branch, including observed state and notes; reports are immutable submissions and expose a review status.

**Tech Stack:** NestJS, Prisma/MySQL, React, TypeScript, TanStack Query.

**Spec:** User request in this task: branch-separated locker management; inventory upload with notes; inventory reports for review.

## Global Constraints

- Use `main_branch_id` as the locker branch scope.
- Branch-scoped users can only read or submit reports for allowed branches.
- A submitted inventory report retains per-locker observations and notes.

---

### Task 1: Persist locker inventory reports

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/modules/club-lockers/club-lockers.module.ts`
- Test: `backend/src/modules/club-lockers/club-lockers.inventory.spec.ts`

**Interfaces:**
- Produces `club_locker_inventory_reports` and `club_locker_inventory_report_items` Prisma models.

- [ ] Write a failing service test proving a report stores a branch, report-level note, one observed locker state, and an item note.
- [ ] Run `npm test -- club-lockers.inventory.spec.ts --runInBand` and confirm it fails before the report API exists.
- [ ] Add report header/item models, generate Prisma client, and add minimal service persistence.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Add branch-scoped locker and report API

**Files:**
- Modify: `backend/src/modules/club-lockers/club-lockers.controller.ts`
- Modify: `backend/src/modules/club-lockers/club-lockers.service.ts`
- Test: `backend/src/modules/club-lockers/club-lockers.inventory.spec.ts`

**Interfaces:**
- Consumes `POST /club-lockers/inventory-reports` with `{ branchId, notes?, items: [{ lockerId, observedStatus, notes? }] }`.
- Produces `GET /club-lockers/inventory-reports` returning submitted reports for review.

- [ ] Write a failing test that rejects a report for a branch outside the caller's scope.
- [ ] Run the focused test and confirm it fails with missing branch validation.
- [ ] Apply branch scope to locker listing/statistics/details and implement report create/list validation.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Build inventory submission and review UI

**Files:**
- Modify: `frontend/src/pages/club/lockers.tsx`

**Interfaces:**
- Consumes locker list and inventory-report endpoints.
- Produces a branch selector, per-locker observation/note inputs, and a reports-for-review tab.

- [ ] Add the inventory and report views under locker management.
- [ ] Keep branch selection synchronized with the locker query and submit only lockers from that branch.
- [ ] Run `npm run typecheck` in `frontend` and confirm it passes.

### Task 4: Verify complete workflow

**Files:**
- Test: `backend/src/modules/club-lockers/club-lockers.inventory.spec.ts`

- [ ] Run `npm test -- club-lockers.inventory.spec.ts --runInBand`.
- [ ] Run `npm run typecheck` in `backend` and `frontend`.
- [ ] Manually verify that a branch report shows the report note and each locker observation/note in the review tab.
