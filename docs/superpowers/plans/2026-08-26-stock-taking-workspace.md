# Stock-Taking Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive ONE80 stock-taking workspace with searchable product selection, unit/package-aware physical counting, editable draft items, and a clear final review.

**Architecture:** Keep the existing session and adjustment tables unchanged. Extend the draft-item API with update/delete operations, isolate unit conversion in a small frontend module, and move session counting into a dedicated routed workspace while retaining the current list page.

**Tech Stack:** NestJS, Prisma, Jest, React 18, React Query, React Router, TypeScript, Tailwind CSS, Radix UI.

**Spec:** `docs/superpowers/specs/2026-08-26-stock-taking-workspace-design.md`

## Global Constraints

- Preserve all unrelated dirty-worktree changes.
- Do not add or run destructive database migrations.
- Keep approval delta-based so post-count inventory movements remain intact.
- Use existing ONE80 design tokens and Arabic RTL conventions.
- Keep all primary mobile touch targets at least 44px.

---

### Task 1: Draft item correction API

**Files:**
- Modify: `backend/src/modules/inventory/stock-taking.controller.ts`
- Modify: `backend/src/modules/inventory/stock-taking.service.ts`
- Test: `backend/src/modules/inventory/stock-taking.service.spec.ts`

**Interfaces:**
- Produces: `updateCountItem(sessionId: number, itemId: number, dto: UpsertCountItemDto)` and `removeCountItem(sessionId: number, itemId: number)`.
- HTTP: `PATCH /stock-taking/:sessionId/items/:itemId` and `DELETE /stock-taking/:sessionId/items/:itemId`.

- [ ] **Step 1: Write failing service tests** proving draft items can be updated/deleted, variance is recomputed from the saved system snapshot, a non-zero variance requires a reason, and non-draft sessions reject changes.
- [ ] **Step 2: Run `npm test -- stock-taking.service.spec.ts --runInBand` in `backend` and confirm the new tests fail because the methods do not exist.**
- [ ] **Step 3: Implement the two service methods and controller routes with draft-state and item-membership validation.**
- [ ] **Step 4: Run the focused test again and confirm it passes.**

### Task 2: Unit-aware count model

**Files:**
- Create: `frontend/src/lib/stock-taking-units.ts`
- Create: `frontend/src/lib/stock-taking-units.spec.ts`

**Interfaces:**
- Produces: compatible unit options and `calculatePhysicalBaseQuantity` for base-unit, compatible-unit, and package-plus-remainder counting.

- [ ] **Step 1: Write a failing executable TypeScript test covering kg-to-g, litre-to-ml, package conversion, package plus loose remainder, and incompatible units.**
- [ ] **Step 2: Run `../backend/node_modules/.bin/tsx --test src/lib/stock-taking-units.spec.ts` in `frontend` and confirm it fails because the production module is missing.**
- [ ] **Step 3: Implement the minimal conversion module using the existing cafe unit conventions.**
- [ ] **Step 4: Run the unit test and frontend typecheck.**

### Task 3: Dedicated session workspace

**Files:**
- Create: `frontend/src/pages/inventory/stock-taking-workspace.tsx`
- Modify: `frontend/src/pages/inventory/stock-taking.tsx`
- Modify: `frontend/src/pages/inventory/opening-stock-tab.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**
- Consumes: the unit conversion module and draft-item API.
- Produces: route `/club/cafe/stock-taking/:id` and an immediate create-to-workspace flow.

- [ ] **Step 1: Add the workspace route and navigate list/create actions to it.**
- [ ] **Step 2: Build the searchable/filterable catalog and counted-items review using the existing product endpoint with a 500-item page.**
- [ ] **Step 3: Build the count sheet with unit/package/remainder inputs, live variance, cost preview, reason validation, and add/update actions.**
- [ ] **Step 4: Add draft-item edit/delete, final review, finalize, and approval actions.**
- [ ] **Step 5: Run frontend typecheck and fix all errors.**

### Task 4: Responsive and visual verification

**Files:**
- Modify as findings require: `frontend/src/pages/inventory/stock-taking-workspace.tsx`

**Interfaces:**
- Verifies: mobile, tablet, desktop, RTL, empty/loading/error, touch, and keyboard behavior.

- [ ] **Step 1: Run backend focused tests, backend build, frontend typecheck, and frontend build.**
- [ ] **Step 2: Run the Impeccable audit/detector for the changed workspace.**
- [ ] **Step 3: Inspect one mobile and one desktop browser render in a bounded visual pass.**
- [ ] **Step 4: Fix material findings in one batch and rerun the affected checks.**
