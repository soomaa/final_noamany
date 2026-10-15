# POS Payment Mix and Shift Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable exact payment methods, arbitrary mixed tender, and a polished printable daily shift-close receipt.

**Architecture:** Persist an immutable catalog snapshot on every POS payment line, aggregate shift-close data through a tested pure domain helper, and share one report DTO between the on-screen preview and thermal print renderer. Existing enum-based rows remain readable through a legacy fallback.

**Tech Stack:** NestJS, Prisma/MySQL, React, TanStack Query, TypeScript, Tailwind CSS, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-pos-shift-close-payments-design.md`

## Global Constraints

- Preserve every existing invoice and payment row.
- Never hard-code ONE80 or GC Gym branding in the new receipt.
- Treat employee/partner accounts as uncollected internal value, not cash.
- Use integer cents for allocation equality.
- Preserve the current permission model.

---

### Task 1: Payment allocation and shift-report domain helpers

**Files:**
- Create: `frontend/src/lib/pos-payment-allocation.ts`
- Test: `frontend/src/lib/pos-payment-allocation.spec.ts`
- Create: `backend/src/modules/sales/shift-close-report.ts`
- Test: `backend/src/modules/sales/shift-close-report.spec.ts`

**Interfaces:**
- Produces: `paymentRemainingCents(total, rows)`, `fillPaymentRemainder(total, rows, index)`, and `buildShiftCloseReport(input)`.

- [ ] Write frontend failing tests for exact-cent totals, remaining allocation, and filling the remainder.
- [ ] Run `npm test -- src/lib/pos-payment-allocation.spec.ts` in `frontend` and verify RED.
- [ ] Implement the minimal allocation helper and verify GREEN.
- [ ] Write backend failing tests for exact catalog labels, legacy fallback, mixed payments, refunds/cancellations, and CL totals.
- [ ] Run `npm test -- --runInBand src/modules/sales/shift-close-report.spec.ts` in `backend` and verify RED.
- [ ] Implement the pure report builder and verify GREEN.

### Task 2: Additive payment snapshots and server validation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260826190000_pos_payment_method_snapshots/migration.sql`
- Modify: `backend/src/modules/sales/dto/quick-sales.dto.ts`
- Modify: `backend/src/modules/sales/pos-payment-validation.util.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Test: `backend/src/modules/sales/pos-payment-validation.util.spec.ts`

**Interfaces:**
- Consumes: exact enabled catalog method id from the cashier.
- Produces: payment rows with `catalogPaymentMethodId`, `methodCode`, and `methodName` snapshots.

- [ ] Write failing validation tests for exact method selection, disabled methods, duplicate split methods, and cent-exact totals.
- [ ] Run the focused Jest test and verify RED.
- [ ] Add nullable snapshot columns and an additive migration.
- [ ] Extend DTO and sale persistence with server-authoritative catalog lookup.
- [ ] Run focused tests and Prisma validation until GREEN.

### Task 3: Shift-close report endpoint

**Files:**
- Modify: `backend/src/modules/sales/shift-sessions.controller.ts`
- Modify: `backend/src/modules/sales/shift-sessions.service.ts`
- Test: `backend/src/modules/sales/shift-sessions.accounting.spec.ts`

**Interfaces:**
- Produces: `GET /shift-sessions/:id/close-report` with identity, counts, totals, exact payment methods, CL value, and drawer reconciliation.

- [ ] Write a failing service test for a cross-midnight session with mixed tenders and CL sales.
- [ ] Run the focused Jest test and verify RED.
- [ ] Query the session's linked sales/payments and pass normalized rows to `buildShiftCloseReport`.
- [ ] Expose the permission-protected controller route.
- [ ] Run focused tests and verify GREEN.

### Task 4: Configurable payment settings and arbitrary mixed checkout

**Files:**
- Create: `frontend/src/components/sales/pos-payment-methods-editor.tsx`
- Create: `frontend/src/components/sales/pos-mixed-payment-panel.tsx`
- Modify: `frontend/src/pages/sales/pos-admin.tsx`
- Modify: `frontend/src/pages/sales/new-receipt.tsx`
- Modify: `frontend/src/types/gym-sales.ts`

**Interfaces:**
- Consumes: enabled POS catalog rows and the allocation helper.
- Produces: exact catalog ids in single or mixed sale payloads.

- [ ] Add the mixed-payment component against the tested helper.
- [ ] Replace the cash/card-only state with arbitrary tender rows.
- [ ] Keep exact custom catalog entries instead of deduplicating by base method.
- [ ] Replace the minimal settings list with editable, reorderable, accessible method cards.
- [ ] Run frontend unit tests and typecheck.

### Task 5: Shift close preview and thermal print

**Files:**
- Create: `frontend/src/components/sales/shift-close-receipt.tsx`
- Modify: `frontend/src/pages/sales/drafts.tsx`

**Interfaces:**
- Consumes: the close-report DTO and POS branding settings.
- Produces: responsive on-screen reconciliation preview plus 58/80 mm print HTML.

- [ ] Add the report action to each shift header.
- [ ] Build a mobile-safe preview with invoice status, financial totals, exact tender breakdown, CL, and drawer figures.
- [ ] Build monochrome print CSS with `@page`, Arabic typography, safe wrapping, and signature lines.
- [ ] Verify the print control respects the existing print permission.
- [ ] Run frontend typecheck and build.

### Task 6: Verification and delivery

**Files:**
- Review all files above.

**Interfaces:**
- Produces: deployable frontend/backend build and additive migration.

- [ ] Run focused and full backend tests.
- [ ] Run frontend unit tests, typecheck, and build.
- [ ] Run Prisma validation and inspect the migration for destructive statements.
- [ ] Run the Impeccable UI audit/detector and fix material findings.
- [ ] Package deployment artifacts without database data or destructive commands.
