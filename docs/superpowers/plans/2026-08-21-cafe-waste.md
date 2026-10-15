# Cafe Waste and Loss Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated cafe waste page that immediately and safely records or reverses waste through ONE80 inventory and accounting.

**Architecture:** A new cafe-waste module owns the user-facing event, catalog normalization, reasons, previews, history, analytics, and reversals. Authoritative quantities and values continue through existing inventory transactions, movements, stock balances, ledger entries, and system expenses.

**Tech Stack:** NestJS, Prisma/MySQL, Jest, React 19, TypeScript, TanStack Query, Tailwind/Radix UI, Recharts.

**Spec:** `docs/superpowers/specs/2026-08-21-cafe-waste-design.md`

## Global Constraints

- Additive database migration only; never rewrite or remove production data.
- Arabic-first RTL UX with existing ONE80 UI components and branch filters.
- Immediate save; no manager approval workflow.
- Prepared products expand recipes; negative stock requires an explicit choice.
- Never delete recorded waste; reverse it with an audit reason.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Waste schema and contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260821120000_cafe_waste_and_loss/migration.sql`
- Create: `backend/src/modules/cafe-waste/dto/cafe-waste.dto.ts`

**Interfaces:**
- Produces Prisma models `cafe_waste_reasons` and `cafe_waste_records`.
- Produces validated DTOs for catalog/history filters, preview/create, reason writes, and reversal.

- [ ] Add failing DTO validation tests for non-positive quantities, invalid source kinds, and missing reversal reasons.
- [ ] Run the focused Jest test and confirm failure because contracts do not exist.
- [ ] Add the additive models/migration and DTOs with decimal precision, audit fields, foreign keys, and indexes.
- [ ] Run focused tests plus `npm run prisma:validate` and `npm run prisma:generate`.

### Task 2: Recipe and unit-aware waste preview

**Files:**
- Create: `backend/src/modules/cafe-waste/cafe-waste.service.ts`
- Create: `backend/src/modules/cafe-waste/cafe-waste.service.spec.ts`

**Interfaces:**
- Produces `preview(dto, user)` returning `source`, `components[]`, `totalCost`, and `hasShortage`.
- Component contract: `{ productId, name, quantity, unit, unitCost, cost, currentStock, afterStock, shortage }`.

- [ ] Write failing service tests for compatible unit conversion, incompatible unit rejection, ready-product deduction, variant recipe selection, nested manufactured expansion/merge, and shortage flags.
- [ ] Run focused Jest tests and confirm each fails for missing behavior.
- [ ] Implement source loading, branch location resolution, recursive recipe expansion, merge, costing, and stock preview.
- [ ] Run focused tests and refactor only while green.

### Task 3: Atomic record, reason, history, reversal, and analytics APIs

**Files:**
- Modify: `backend/src/modules/cafe-waste/cafe-waste.service.ts`
- Modify: `backend/src/modules/cafe-waste/cafe-waste.service.spec.ts`
- Create: `backend/src/modules/cafe-waste/cafe-waste.controller.ts`
- Create: `backend/src/modules/cafe-waste/cafe-waste.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/finance/system-expense.util.ts`

**Interfaces:**
- Produces REST endpoints under `/cafe-waste` for catalog, preview, records, analytics, reasons, and reversal.
- Uses `InventoryStockService.applyTransaction`, `ModuleLedgerService.postInventoryConsumption`, and `LedgerService.reverseEntry` within caller-owned transactions.

- [ ] Write failing tests proving explicit negative-stock consent, globally reusable reason creation, approved damage transaction data, duplicate reversal rejection, stock-restoring receipt data, journal reversal, creator names, and reversed-record analytics exclusion.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement transactional create/reverse, reason CRUD, paginated history, analytics, and controller/module wiring.
- [ ] Run focused tests and backend typecheck; fix only feature-related failures.

### Task 4: RBAC, route, navigation, and API types

**Files:**
- Create: `backend/prisma/migrations/20260821121000_cafe_waste_rbac/migration.sql`
- Modify: `backend/prisma/seed/00-foundation.ts`
- Modify: `frontend/src/lib/club-routes.ts`
- Modify: `frontend/src/lib/gym-sales-routes.ts`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/cafe/route-pages.tsx`
- Create: `frontend/src/pages/cafe/waste-types.ts`

**Interfaces:**
- Produces route `CR.cafe.waste === '/club/cafe/waste'` and lazy page export `CafeWastePage`.
- Produces frontend contracts matching all cafe-waste endpoints.

- [ ] Add the RBAC resource/page/actions migration without changing existing grants.
- [ ] Register route, navigation entry, lazy export, locale route labels, and strict permission mapping.
- [ ] Add typed API contracts and run frontend typecheck to expose missing page integration.

### Task 5: Waste registration and reason settings UI

**Files:**
- Create: `frontend/src/pages/cafe/waste.tsx`
- Create: `frontend/src/components/cafe/waste-registration-sheet.tsx`
- Create: `frontend/src/components/cafe/waste-reasons-tab.tsx`

**Interfaces:**
- Consumes catalog/preview/reasons/create APIs.
- Produces search/category item cards, registration sheet, shortage choice dialog, inline reason creation, and settings tab.

- [ ] Implement query state, debounced search, category tabs, responsive cards, loading/empty/error states, and branch awareness.
- [ ] Implement preview-driven sheet with units, variants, quantities, reasons, inline addition, notes, component/cost/balance summary, and accessible submission feedback.
- [ ] Implement reason create/rename/activate/deactivate management.
- [ ] Run frontend typecheck and build; resolve only introduced errors.

### Task 6: History, reversal, analytics, and main cafe reports

**Files:**
- Create: `frontend/src/components/cafe/waste-history-tab.tsx`
- Create: `frontend/src/components/cafe/waste-analytics-tab.tsx`
- Modify: `frontend/src/pages/cafe/waste.tsx`
- Modify: `backend/src/modules/cafe/cafe-products.service.ts`
- Modify: `backend/src/modules/cafe/cafe-products.service.spec.ts`
- Modify: `frontend/src/pages/cafe/reports.tsx`
- Modify: `frontend/src/locales/ar.json`
- Modify: `frontend/src/locales/en.json`

**Interfaces:**
- Consumes history/analytics/reversal APIs.
- Extends cafe report `inventory.waste` with `manualCost`, `automaticCost`, and combined `totalCost` without double counting.

- [ ] Write a failing cafe-report test for manual/automatic separation and reversed-record exclusion.
- [ ] Run the focused test and confirm expected failure.
- [ ] Implement report aggregation, history filters/details/reversal dialog, analytics cards/charts/rankings, and report breakdown UI.
- [ ] Run focused backend tests and frontend typecheck/build.

### Task 7: Full verification and deploy-safe handoff

**Files:**
- Verify all files above; do not modify unrelated changes.

- [ ] Run Prisma validation/generation and migration SQL review for additive-only behavior.
- [ ] Run focused and full backend tests, backend typecheck/build, frontend typecheck/build.
- [ ] Review the final diff against every spec requirement and scan for placeholders.
- [ ] Report exact verification evidence, migration/deploy ordering, and any pre-existing failures separately.
