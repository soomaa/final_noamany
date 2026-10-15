# Cafe Fixes Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the latest relevant ONE80 cafe stock-taking, customer/POS, payment, and shift-close fixes into the standalone One Million and Ordera products without introducing gym dependencies or overwriting either brand.

**Architecture:** Treat ONE80 as the behavior reference and each standalone cafe project as the integration authority. Port only behavior proven missing by tests and semantic diffs; keep target routes, brand assets, desktop licensing, target-only components, and database ownership unchanged.

**Tech Stack:** NestJS, Prisma/MySQL, React, TypeScript, TanStack Query, Vite, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-27-cafe-fixes-port-design.md`

## Global Constraints

- Do not copy `.env`, databases, uploads, generated customer data, or ONE80 gym-only modules.
- Preserve One Million branding in `/Users/fatmaatefkasem/Desktop/caffe copy` and Ordera branding in `/Users/fatmaatefkasem/Desktop/caffe`.
- Preserve standalone `/cafe/...` routes; do not copy ONE80 `/club/cafe/...` routes.
- Preserve each project's desktop licensing/bootstrap behavior and target-only POS components.
- Use failing tests before each behavior change.
- No migrations unless a schema comparison proves a missing persistent field; never run a migration against user data in this task.
- The directories are not Git repositories, so test/build checkpoints replace commit steps.

---

### Task 1: Stock-taking branch and session-number safety

**Files (repeat in both target roots):**
- Modify: `backend/src/modules/inventory/inventory-location.service.ts`
- Modify: `backend/src/modules/inventory/inventory-location.service.spec.ts`
- Modify: `backend/src/modules/inventory/stock-taking.service.ts`
- Modify: `backend/src/modules/inventory/stock-taking.service.spec.ts`
- Create: `frontend/src/lib/stock-taking-branch.ts`
- Create: `frontend/src/lib/stock-taking-branch.spec.ts`
- Modify: `frontend/src/pages/inventory/stock-taking-tab.tsx`
- Modify: `frontend/src/pages/inventory/stock-taking-workspace.tsx`

**Interfaces:**
- Produces: `InventoryLocationService.resolveStockTakingBranch(user, requestedBranchId): number`.
- Produces: `resolveStockTakingCreateBranch(userBranch, selectedBranch): number | null`.
- Produces: `resolveStockTakingCatalogBranch(sessionBranch): number | null`.
- Keeps: One Million internal warehouse code `ONE MILLION-STOCK-${branchId}` and Ordera's existing internal warehouse code.

- [ ] **Step 1: Add Backend failing tests**

Add cases that prove a branchless level-1 admin can create a session for `branchId: 7`, a branch-scoped user cannot select another branch, and `{ maxNum: 31n }` yields `CNT000032`.

- [ ] **Step 2: Verify Backend RED**

Run in each `backend`:

```bash
npx jest src/modules/inventory/stock-taking.service.spec.ts src/modules/inventory/inventory-location.service.spec.ts --runInBand
```

Expected: failures caused by missing branch resolver and number/`bigint` addition.

- [ ] **Step 3: Implement minimal Backend behavior**

Add `resolveStockTakingBranch` while retaining the target's own warehouse branding, use it in `createSession`, and generate numbers with:

```ts
const nextNumber = BigInt(rows[0]?.maxNum ?? 0) + 1n;
return `CNT${nextNumber.toString().padStart(6, '0')}`;
```

- [ ] **Step 4: Verify Backend GREEN**

Run the same focused Jest command and require all cases to pass.

- [ ] **Step 5: Add Frontend failing branch tests**

Create literal assertions for branchless admin selection, assigned-user branch precedence, and catalog branch resolution from the persisted session.

- [ ] **Step 6: Verify Frontend RED**

Run in each `frontend`:

```bash
npx tsx --test src/lib/stock-taking-branch.spec.ts
```

Expected: module/function missing.

- [ ] **Step 7: Implement and integrate the branch helpers**

Use the selected branch in the create-session payload for branchless admins, put the create button in the page's top action area, and load `/products` from `session.branchId` inside the workspace. Preserve `/cafe/stock-taking` navigation and target-specific copy.

- [ ] **Step 8: Verify Frontend GREEN**

Run the focused Node test and each frontend typecheck.

---

### Task 2: Shift-close invoice summary and payment-method receipt

**Files (repeat in both target roots):**
- Modify: `backend/src/modules/sales/shift-close-report.ts`
- Modify: `backend/src/modules/sales/shift-close-report.spec.ts`
- Modify: `backend/src/modules/sales/shift-sessions.service.ts`
- Modify: `backend/src/modules/sales/shift-sessions.accounting.spec.ts`
- Create: `frontend/src/lib/shift-close-print.ts`
- Create: `frontend/src/lib/shift-close-print.spec.ts`
- Modify: `frontend/src/components/sales/shift-close-receipt.tsx`

**Interfaces:**
- Extends `ShiftCloseReportData` with `invoices[]` containing invoice number, time, customer, status, amounts, and payment allocations.
- Produces: `buildShiftCloseHtml(report, businessName, logoUrl): string` used by both preview and printer.
- Preserves: target business name/logo defaults and setting overrides.

- [ ] **Step 1: Add Backend failing report tests**

Use literal invoice `INV-0042` and payments `cash: 50`, `InstaPay: 30`, `SnapPay: 20`; require the report invoice summary to match. Add an employee invoice case requiring the unpaid balance as `CL — حساب موظف/شريك`.

- [ ] **Step 2: Verify Backend RED**

```bash
npx jest src/modules/sales/shift-close-report.spec.ts src/modules/sales/shift-sessions.accounting.spec.ts --runInBand
```

Expected: `report.invoices` is missing.

- [ ] **Step 3: Implement report invoices and service mapping**

Map `sale_number`, `sale_date`, `sale_time`, `customer_name`, `status`, and `subtotal` in `getCloseReport`; build normalized invoice payment rows in `buildShiftCloseReport`. Do not port unrelated ONE80 shift authentication or policy changes.

- [ ] **Step 4: Verify Backend GREEN**

Run the same focused Jest command and require all cases to pass.

- [ ] **Step 5: Add Frontend failing receipt test**

Require 80mm output, escaped brand text, logo URL, English digits, invoice number/time/value, payment-method summary, and signatures.

- [ ] **Step 6: Verify Frontend RED**

```bash
npx tsx --test src/lib/shift-close-print.spec.ts
```

Expected: print builder module is missing.

- [ ] **Step 7: Implement receipt builder and UI integration**

Use one HTML builder for print and iframe preview. Default One Million to `ONE MILLION` and `/ONE MILLION.png`; keep Ordera's existing business name/logo defaults. Wait for receipt images before calling `print()` and expose accessible summary/preview tabs.

- [ ] **Step 8: Verify Frontend GREEN**

Run the receipt test and frontend typecheck in each project.

---

### Task 3: POS, customers, and payment parity audit

**Files to compare and modify only when a failing behavior test proves a gap:**
- `backend/src/modules/sales/dto/quick-sales.dto.ts`
- `backend/src/modules/sales/quick-sales.service.ts`
- `backend/src/modules/sales/pos-admin/pos-payment-methods.service.ts`
- `frontend/src/pages/cafe/customers.tsx`
- `frontend/src/pages/sales/new-receipt.tsx`
- `frontend/src/components/sales/pos-mixed-payment-panel.tsx`
- `frontend/src/components/sales/pos-payment-methods-editor.tsx`
- `frontend/src/lib/pos-payment-allocation.spec.ts`

**Interfaces:**
- Keeps the existing customer phone lookup and customer analytics endpoints.
- Keeps editable per-invoice employee/partner discounts.
- Keeps exact-total mixed payment allocation and configurable payment methods.

- [ ] **Step 1: Run existing parity tests**

```bash
npm run test:pos-payments
```

and the relevant Backend quick-sales/payment-method Jest suites.

- [ ] **Step 2: Compare current target behavior with the approved spec**

Confirm phone lookup/autofill, customer analytics/ranking, editable deferred-sale discount, custom payment methods, required references, and mixed totals are already present.

- [ ] **Step 3: Add a failing test for each confirmed behavioral gap only**

Expected: every new test fails because of the named missing behavior, not formatting or branding.

- [ ] **Step 4: Implement only proven gaps and rerun focused tests**

Do not replace target POS layout, calculator, partner page, routes, colors, or permission boundaries.

---

### Task 4: UI hardening and brand preservation

**Files:** All frontend files changed by Tasks 1–3.

**Interfaces:** Operational screens remain RTL/LTR responsive and use each target's existing design tokens.

- [ ] **Step 1: Inspect changed pages at desktop and mobile widths**

Check loading, API error with retry, empty catalog, long names, large totals, disabled submissions, keyboard focus, and receipt overflow.

- [ ] **Step 2: Fix material findings in one bounded batch**

Keep logical spacing, 44px touch targets, tabular numerals, semantic status colors, clear recovery copy, and brand-correct assets.

- [ ] **Step 3: Run Impeccable detector once**

```bash
node /Users/fatmaatefkasem/.agents/skills/impeccable/scripts/detect.mjs --json <changed frontend files>
```

Fix material findings, then perform at most one confirmation round.

---

### Task 5: Full verification and safe packages

**Files:**
- Create/update target release scripts only if the existing scripts cannot create code-only archives.
- Create one dated ZIP in each target root.

**Interfaces:** Each ZIP contains source/build/deploy files but no live `.env`, database dump, uploads, node_modules, or customer data.

- [ ] **Step 1: Verify Prisma and Backend**

Run `npm run prisma:validate`, `npm test -- --runInBand`, and `npm run build` in each backend.

- [ ] **Step 2: Verify Frontend**

Run the complete frontend test scripts and `npm run build` in each frontend.

- [ ] **Step 3: Build code-only ZIPs**

Use each project's own brand/release structure; include a deploy script that preserves server `.env` and data.

- [ ] **Step 4: Inspect archives**

Run `unzip -t`, scan archive paths for secrets/data/uploads, verify the BigInt fix and receipt builder inside each ZIP, and calculate SHA-256.

- [ ] **Step 5: Deliver**

Provide clickable ZIP links, checksums, exact deployment commands, test counts, and any non-blocking warnings.
