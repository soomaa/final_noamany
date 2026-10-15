# ONE80 Cross-Gym Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all portable Fitness Time and PHAROS sales, trainer, printing, member-app, package, class, and branch-safety improvements into ONE80 without replacing ONE80-specific modules or data contracts.

**Architecture:** Deliver five vertical, independently testable feature slices. Translate source behavior at service boundaries, keep ONE80's `club_sales_crm_*` schema and `/sales-portal` route family, and use additive migrations with conservative defaults.

**Tech Stack:** NestJS, Prisma/MySQL, React, TypeScript, TanStack Query, React Router, Tailwind CSS, Jest, Node test runner, Vite.

**Spec:** User-approved cross-project brief in task `01a08392-0e69-7211-a60b-87a54376a2d6`, informed by `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/PHAROS/docs/superpowers/specs/2026-08-30-cross-gym-sales-trainer-pos-design.md`.

## Global Constraints

- ONE80 is the base; preserve HR, POS, Cafe, Accounting, inventory, member fields, branding, and all pre-existing dirty work.
- Keep `/sales` as POS and personal sales at `/sales-portal`.
- Use `club_sales_crm_leads`; never mutate, rename, or claim legacy `club_leads`.
- Migrations are additive and data-safe only. Do not deploy, reseed, reset, or touch production.
- Every behavior change follows RED → GREEN → refactor and records commands/results in `docs/cross-gym-sync/ONE80-SYNC-STATUS.md`.
- UI remains ONE80-branded, RTL/LTR-safe, keyboard accessible, and verified at 390px and desktop widths.

---

### Task 1: CRM reminders, renewals, and actual subscription context

**Files:**
- Create/adapt: `backend/src/modules/club-sales/lead-subscription-context.ts`
- Create/adapt: `frontend/src/pages/sales-portal/sales-reminders.tsx`
- Modify: `backend/src/modules/club-sales/club-leads.service.ts`
- Modify: `backend/src/modules/club-sales/club-leads.controller.ts`
- Modify: `backend/src/modules/club-sales/dto/leads.dto.ts`
- Modify: `backend/src/modules/club-members/club-members.service.ts`
- Modify: `frontend/src/pages/sales-portal/index.tsx`
- Modify: `frontend/src/pages/sales-portal/sales-workspace-model.ts`
- Test: focused `club-leads.*`, `lead-subscription-context.spec.ts`, `club-members.sales-renewals.spec.ts`, and sales workspace model tests

**Interfaces:**
- Consumes: ONE80 CRM lead/follow-up rows, member/subscription/receipt data, authenticated branch/assignee scope.
- Produces: reminder list/completion, renewal candidates and conversion, renewal handoff export, and paid subscription context without exposing another rep's data.

- [ ] Write adapted failing backend tests against `club_sales_crm_leads`, including overdue reminder completion, branch-safe renewal conversion, and paid receipt totals.
- [ ] Run focused Jest and confirm failures are missing behavior, never missing fixtures or imports.
- [ ] Implement the smallest controller/service/DTO changes, keeping CRM queries on `club_sales_crm_*`.
- [ ] Write failing frontend tests for `renewals` and `reminders` route/tab behavior under `/sales-portal`.
- [ ] Implement the portal sections and profile navigation with retry/empty/pending states.
- [ ] Run focused backend/frontend tests, Prisma validate/generate, typechecks, and builds; update status and commit only Task 1 paths.

### Task 2: Sales-team defaults, activation, transfer, and multi-branch scope

**Files:**
- Create/adapt: `backend/src/modules/club-sales/sales-defaults.ts`
- Create/adapt: `backend/src/modules/club-sales/lead-transfer-plan.ts`
- Create/adapt: `backend/src/modules/employees/sales-rep-creation-boundary.ts`
- Create: additive Prisma migration and update `backend/prisma/schema.prisma`
- Modify: club commission settings, leads, employees, auth, subscription sales ownership, RBAC, and management UI files
- Create/adapt: sales defaults, activation, and transfer components/tests

**Interfaces:**
- Consumes: explicit/global settings, active state, allowed branch ids, current lead/member ownership.
- Produces: effective targets/tiers, assignable reps, transfer preview/commit, and branch-safe rep options.

- [ ] Write failing pure/service tests for defaults, tier gaps/labels, inactive assignment rejection, transfer counts, creation boundary, and branch intersections.
- [ ] Run focused tests and capture expected RED failures.
- [ ] Add schema/migration and minimal backend behavior.
- [ ] Add failing view-model/component tests for defaults opt-in and deactivation transfer flows.
- [ ] Implement UI using existing ONE80 tokens and routes.
- [ ] Verify focused/full suites, schema, builds, and 390px/desktop states; update status and commit.

### Task 3: Trainer private work, commission integrity, refunds, payroll, and ratings

**Files:**
- Create/adapt: `trainer-earnings.ts`, `trainer-receipt-commissions.ts`, `trainer-subscription-refunds.ts`
- Modify: trainer portal/service/controller/types/workspace, subscription receipt/refund services, payroll integration, trainer ratings
- Create: additive trainer commission/rating migration
- Test: earnings regression, commission/refund, checkout rating, payroll integrity, trainer portal model/UI

**Interfaces:**
- Consumes: private subscriptions/attendance, receipts/refunds, configured commission mode/rate, payout/payment rows.
- Produces: active private clients, check-ins, non-duplicated earnings, reversible commission ledger effects, payroll-safe dues, and one attendance-bound member rating.

- [ ] Write failing backend tests for private clients/check-ins, commission method, refund clawback, payout idempotency, and attendance-bound rating.
- [ ] Run focused tests and confirm correct RED output.
- [ ] Implement pure calculations first, then transactional service integration and additive migration.
- [ ] Write failing frontend model tests for new private-client/check-in/rate sections and rating retry separation.
- [ ] Implement accessible responsive UI without replacing ONE80's trainer shell/calendar.
- [ ] Verify focused/full suites, schema, builds, and visual states; update status and commit.

### Task 4: Central paid-flow printing and expense documents

**Files:**
- Create/adapt: `frontend/src/lib/club-printing.ts`, printing policy hook, thermal template/component, isolated print tests
- Modify: gym policy schema/service/UI, subscription/receipt/service payment flows, expense service/UI
- Create: additive central-printing migration

**Interfaces:**
- Consumes: server-confirmed positive-value transaction, persisted policy, paper size, language, copies.
- Produces: exactly-once auto-print decision plus always-available manual reprint; print errors never retry money writes.

- [ ] Write failing decision/template/service tests for each paid category, zero values, blocked popups, language, copy count, and expense approval/print access.
- [ ] Run focused tests and capture RED failures.
- [ ] Add policy schema/migration and reusable print model/template.
- [ ] Integrate flows surgically; do not overwrite dirty POS files.
- [ ] Load Impeccable craft floor before UI edits, then verify RTL/LTR, keyboard focus, 390px/A4/80mm rendering.
- [ ] Run detector, focused/full suites, schema, builds; update status and commit.

### Task 5: PHAROS package, member-app, class, trainer, and branch additions

**Files:**
- Modify: subscription type schema/service/types/admin/member API for promotions
- Add: `am_payment_methods` schema/service/admin/member API contract
- Add: `club_trainer_availability` schema/service/controller/member API/UI
- Verify/adapt: class audience and branch-scope services/tests
- Create: one additive migration containing only absent ONE80 columns/tables/indexes

**Interfaces:**
- Consumes: branch-aware subscription types, member branch, class audience, trainer weekly availability, app payment catalog.
- Produces: valid active offers, branch/global app payments, audience-grouped classes, member-visible trainer availability/ratings, and no cross-branch leakage.

- [ ] Write failing service tests for promo expiry/price validation, payment catalog fallback, availability validation, audience filter, ratings, and branch isolation.
- [ ] Run focused tests and confirm RED failures.
- [ ] Add minimal schema/migration/backend mappings while preserving ONE80-only fields and defaults.
- [ ] Add failing frontend tests for package/admin/member presentation and availability editing.
- [ ] Implement UI in ONE80 visual language and harden long Arabic/English content.
- [ ] Run detector, focused/full suites, schema, builds, migration scan, and clean-clone packaging check; update status and commit.

### Task 6: Final integration verification

**Files:**
- Modify: `docs/cross-gym-sync/ONE80-SYNC-STATUS.md`

**Interfaces:**
- Consumes: all five green slices.
- Produces: evidence-backed completion report and explicit remaining blockers/non-goals.

- [ ] Run all backend tests, backend typecheck/build, Prisma validate/generate, migration destructive-token scan, all frontend tests, frontend typecheck/build.
- [ ] Run Impeccable detector once over changed UI targets and fix material findings in one bounded pass.
- [ ] Inspect desktop and 390px Arabic/English portal, trainer, printing, and app-management states; perform at most one confirmation pass.
- [ ] Confirm Git diff excludes all baseline dirty Cafe/POS files from sync commits.
- [ ] Update the verification ledger with exact counts and commit hashes.
