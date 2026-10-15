# Dual Cafe Ingredient Swap and Money Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe bulk ingredient replacement and consistent English money formatting to ONE80 and ONE MILLION, then package verified release ZIPs.

**Architecture:** Extend the existing cafe-products domain with preview/apply endpoints that update product and variant recipe rows atomically. Add a full-width workspace tab to the raw-materials page using existing searchable controls. Centralize money-number formatting and route screen/receipt currency output through it.

**Tech Stack:** NestJS, Prisma, class-validator, React, TanStack Query, TypeScript, Node test runner, Jest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-09-dual-cafe-ingredient-swap-money-format-design.md`

## Global Constraints

- Implement identical behavior in `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80` and `/Users/fatmaatefkasem/Desktop/caffe copy`.
- Preserve historical sales, stock movements, and invoices.
- Use existing cafe product permissions; add no schema migration.
- Monetary display uses English digits, `EGP`, hides `.00`, and shows two digits for non-zero piastres.

---

### Task 1: Canonical money formatting

**Files:** `frontend/src/lib/formatters.ts`, its tests, cafe/POS display helpers and receipt output in both projects.

**Interfaces:** Produce `formatMoneyNumber(value): string` and update `formatMoney(value, currency?): string`.

- [ ] Write failing literal formatter and receipt tests for `20`, `20.5`, `20.25`, and `1250`.
- [ ] Run the focused tests and confirm current Arabic/fixed-two output fails.
- [ ] Implement the formatter and replace cafe/POS fixed-two display helpers without changing input serialization.
- [ ] Run focused tests, typecheck, and source scans for remaining user-visible fixed-two cafe money output.

### Task 2: Ingredient swap backend

**Files:** `backend/src/modules/cafe/dto/ingredient-swap.dto.ts`, `cafe-products.controller.ts`, `cafe-products.service.ts`, and focused specs in both projects.

**Interfaces:** Preview returns `{source,target,rows}`; apply accepts `{sourceIngredientId,targetIngredientId,rows:[{recipeType,recipeId,quantity,unit}]}` and returns `{updatedCount,productCount}`.

- [ ] Write failing service/controller tests for permissions, preview rows, duplicate-target conflicts, atomic updates, invalid/stale rows, and audit creation.
- [ ] Implement DTO validation and route handlers before the dynamic `:id` route.
- [ ] Implement preview and transactional apply with target-unit compatibility checks.
- [ ] Run focused backend tests and typecheck in both projects.

### Task 3: Ingredient swap workspace

**Files:** `frontend/src/components/cafe/ingredient-swap-workspace.tsx`, `frontend/src/pages/cafe/raw-materials.tsx`, type contracts, and source-level UI tests in both projects.

**Interfaces:** Consume the two endpoints from Task 2 and invalidate `products`, `cafe-products`, and swap preview queries after success.

- [ ] Write failing UI contract tests for two searchable comboboxes, selective rows, conflicts, empty/loading/error states, and disabled/sticky apply action.
- [ ] Build the workspace with accessible labels, checkbox selection, positive inline quantities, category search, and confirmation.
- [ ] Integrate it as the `تبديل الخامات` tab beside `قائمة الخامات`.
- [ ] Run UI tests, typecheck, Impeccable detector, and production builds.

### Task 4: Verification and release ZIPs

**Files:** release ZIPs at each project root.

- [ ] Run focused and full builds for both backends and frontends.
- [ ] Inspect diffs and ensure unrelated dirty files are excluded from release archives.
- [ ] Package code-only ZIPs containing the changed backend/frontend files plus the design and plan docs.
- [ ] List archive contents and calculate SHA-256 checksums.
