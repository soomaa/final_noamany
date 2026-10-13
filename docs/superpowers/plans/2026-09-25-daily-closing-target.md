# Daily Closing and Target Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secured Daily Closing and Target Report APIs, screens, migrations, and regression tests using the current project data only.

**Architecture:** Add a dedicated reporting service in the existing Finance module so Monthly Analysis is not changed. The service resolves the authenticated user's effective branch, employee, and date scope before querying Prisma, then returns decimal-safe JSON for React report pages and exports.

**Tech Stack:** NestJS, Prisma/MySQL, class-validator, Jest, React, TypeScript, TanStack Query, existing report-shell/export helpers.

**Spec:** `docs/superpowers/specs/2026-09-25-daily-closing-target-design.md`

## Global Constraints

- Implement only Daily Closing and Target Report; do not modify Monthly Analysis.
- Use current Prisma models and current database only; never run legacy import, backfill, or reset commands.
- The migration is additive: nullable fields only, no defaults, no data updates.
- Backend enforces Level 1/2/3, branch 3 expansion, employee scope, and effective date scope.
- `cash` is Cash; every other explicit method is KNET for receipt-section breakdowns.
- Use saved header dimensions and prescribed operational date fields; never derive cafe classification from current product categories.
- Money is accumulated with Prisma `Decimal` or string/decimal-safe helpers, then serialized as two-decimal values; never sum money with JavaScript floating point.
- The repository has no Git metadata. At task checkpoints, record the changed files and test command/output instead of committing.

## Review Focus

- A Level 2 caller sends another `branchId`, `employeeId`, and an old date range; the backend must return only the caller's branch/employee/current period.
- A Level 3 caller selects an employee from another branch; the report must reject it rather than return an empty or widened result.
- An invoice's product changes category after sale; Daily Closing must still use the saved `cafe_category_id` on its header.
- A non-cash payment such as `visa`, `wallet`, or `mixed` must be included in KNET, not lost from the breakdown.
- A `gender_scope = null` expense must not appear in a male-only or female-only report.

---

### Task 1: Add reporting dimensions to Prisma

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260925194500_daily_closing_target_dimensions/migration.sql`
- Test: `backend/prisma/schema.prisma` through `npm run prisma:validate`

**Interfaces:**
- Produces `DailyClosingClassification`, `sales_quick_sales.target_employee_id`, and the `target_employee` relation used by Tasks 2-4.
- Produces `inv_categories.daily_closing_classification` used by Daily Closing queries.

- [ ] **Step 1: Write the migration assertions before changing the schema**

Create a focused SQL review checklist in the migration comments and assert the generated migration contains only additions:

```sql
ALTER TABLE `sales_quick_sales` ADD COLUMN `target_employee_id` INTEGER NULL;
CREATE INDEX `idx_sales_quick_sales_target_employee_id`
  ON `sales_quick_sales`(`target_employee_id`);
ALTER TABLE `inv_categories`
  ADD COLUMN `daily_closing_classification` ENUM('NORMAL', 'PROTEIN') NULL;
```

- [ ] **Step 2: Verify the pre-change schema cannot generate the requested client contract**

Run: `npm run prisma:validate`

Expected: validation succeeds but Prisma has neither `target_employee_id` nor `daily_closing_classification`; record that absence from `schema.prisma` before editing.

- [ ] **Step 3: Update Prisma schema and create the additive migration**

Add the enum and nullable category field. Add the nullable quick-sale field, its `employees` relation, the inverse employee relation, and `@@index([target_employee_id])`. Generate SQL without default values or `UPDATE` statements. Add a foreign key that preserves existing rows (`ON DELETE SET NULL`).

- [ ] **Step 4: Validate the schema and inspect migration safety**

Run: `npm run prisma:validate`

Expected: exit 0. Inspect migration with:

```powershell
rg -n "DEFAULT|UPDATE|DELETE|target_employee_id|daily_closing_classification" prisma/migrations/20260925194500_daily_closing_target_dimensions/migration.sql
```

Expected: only the field/enum/index/foreign-key DDL; no historical-data mutation.

- [ ] **Step 5: Record checkpoint**

Record modified files and the validation output in the task handoff; do not create a Git commit because this checkout is not a Git repository.

### Task 2: Persist and validate the Quick Sales target salesperson

**Files:**
- Modify: `backend/src/modules/sales/dto/quick-sales.dto.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.spec.ts`

**Interfaces:**
- Consumes `target_employee_id` from Task 1.
- Produces optional `targetEmployeeId` in create/draft-finalization request and response contracts.
- Produces a persisted header field used by Target Report in Task 4.

- [ ] **Step 1: Write failing service tests**

Add tests proving that a sale saves the explicit target employee, rejects a missing employee, and rejects an employee outside the sale branch:

```ts
it('stores targetEmployeeId on a quick-sale header', async () => {
  prisma.employees.findFirst.mockResolvedValue({ id: 41, branch_id_fk: 2 });
  await service.create({ ...saleDto, branchId: 2, targetEmployeeId: 41 }, 7, user);
  expect(prisma.sales_quick_sales.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ target_employee_id: 41 }),
  }));
});

it('rejects a target employee outside the selected branch', async () => {
  prisma.employees.findFirst.mockResolvedValue(null);
  await expect(service.create({ ...saleDto, branchId: 2, targetEmployeeId: 99 }, 7, user))
    .rejects.toThrow('الموظف المحدد');
});
```

- [ ] **Step 2: Run the targeted tests to confirm failure**

Run: `npm test -- quick-sales.service.spec.ts --runInBand`

Expected: failures because `targetEmployeeId` is not accepted or persisted.

- [ ] **Step 3: Implement DTO, branch-aware validation, mapping, and persistence**

Add `@IsOptional() @Type(() => Number) @IsInt() @Min(1) targetEmployeeId?: number` to the create/editable-sale DTO. Validate the employee through the current employee table and the sale's effective branch before the transaction. Add `target_employee_id: dto.targetEmployeeId ?? null` to both create and draft-finalization write paths, and map it to `targetEmployeeId` in read responses. Do not substitute `employeeId`.

- [ ] **Step 4: Run targeted tests to confirm pass**

Run: `npm test -- quick-sales.service.spec.ts --runInBand`

Expected: exit 0, including explicit employee persistence and foreign-branch rejection.

- [ ] **Step 5: Record checkpoint**

Record changed files and test output.

### Task 3: Build Daily Closing query contract and aggregation service

**Files:**
- Modify: `backend/src/modules/finance/dto/finance.dto.ts`
- Create: `backend/src/modules/finance/daily-closing-target.service.ts`
- Modify: `backend/src/modules/finance/finance-reports.controller.ts`
- Modify: `backend/src/modules/finance/finance.module.ts`
- Create: `backend/src/modules/finance/daily-closing-target.service.spec.ts`

**Interfaces:**
- Consumes Task 1 dimensions and `JwtUser`/`BranchScopeService`.
- Produces `dailyClosing(query, user): Promise<DailyClosingResponse>` for `GET /finance/daily-closing`.
- `DailyClosingResponse` contains each named section as `{ total, cash?, knet? }`, then `totalRevenue`, `totalOutflows`, `netProfit`, `totalCash`, and `totalKnet`.

- [ ] **Step 1: Write failing Daily Closing tests**

Cover prescribed date fields, branch expansion, classification, payment mapping, deleted rows, and equations:

```ts
it('uses the quick-sale header category snapshot and puts every non-cash payment in KNET', async () => {
  prisma.sales_quick_sales.findMany.mockResolvedValue([
    { collected_amount: dec('100'), payment_method: 'cash', cafe_category: { daily_closing_classification: 'NORMAL' } },
    { collected_amount: dec('75'), payment_method: 'wallet', cafe_category: { daily_closing_classification: 'PROTEIN' } },
  ]);
  const result = await service.dailyClosing({ branchId: '3', fromDate: '2026-09-01', toDate: '2026-09-01' }, levelOne);
  expect(result.normalSales).toMatchObject({ total: '100.00', cash: '100.00', knet: '0.00' });
  expect(result.proteinSales).toMatchObject({ total: '75.00', cash: '0.00', knet: '75.00' });
  expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ branch_id: { in: [3, 8, 9] } }),
  }));
});

it('computes outflows with purchase returns subtracted', async () => {
  mockDailyRows({ purchases: '100', supplierPayments: '20', expenses: '10', refunds: '5', purchaseReturns: '15' });
  await expect(service.dailyClosing(query, levelOne)).resolves.toMatchObject({
    totalOutflows: '120.00', netProfit: expect.any(String),
  });
});
```

- [ ] **Step 2: Run Daily Closing tests to confirm failure**

Run: `npm test -- daily-closing-target.service.spec.ts --runInBand`

Expected: failure because the service and endpoint contract do not exist.

- [ ] **Step 3: Implement validation, effective scope, and independent source queries**

Add `DailyClosingQueryDto` with optional `branchId`, `fromDate`, `toDate`, and `gender`. Reject invalid IDs and reversed ranges. Resolve effective dates and branches before querying. Query:

```ts
club_subscriptions.registration_date / paid_amount
club_locker_subscriptions.subscription_start_date / paid_amount
sales_quick_sales.sale_date / collected_amount / payment_method / cafe_category_id
prc_purchase_returns.return_date / total_amount / is_deleted = false
prc_purchase_invoices.invoice_date / invoice_amount / is_deleted = false
prc_supplier_payments.payment_date / payment_amount / is_deleted = false
fin_expenses.expense_date / total_amount / gender_scope / is_deleted = false
club_subscription_refunds.refund_date / refund_amount
```

Separate regular/private with the explicit `private_package_id` relation. Include only categories classified `NORMAL` or `PROTEIN`. Apply gender only when the caller chose male or female. Use decimal helpers for all additions and serialize to fixed two-decimal strings.

- [ ] **Step 4: Add controller endpoint and protection**

Add `@Get('daily-closing')` before parameterized routes, require the existing financial-reports view permission, inject `@CurrentUser()`, and delegate to the new service. Register the service in `FinanceModule`.

- [ ] **Step 5: Run the focused report test suite**

Run: `npm test -- daily-closing-target.service.spec.ts --runInBand`

Expected: exit 0 for normal branches, branch 3, private/regular separation, Cash/KNET, exact date fields, deleted records, gender scope, and aggregate formulas.

- [ ] **Step 6: Record checkpoint**

Record changed files and test output.

### Task 4: Build Target Report aggregation and scope enforcement

**Files:**
- Modify: `backend/src/modules/finance/dto/finance.dto.ts`
- Modify: `backend/src/modules/finance/daily-closing-target.service.ts`
- Modify: `backend/src/modules/finance/finance-reports.controller.ts`
- Modify: `backend/src/modules/finance/daily-closing-target.service.spec.ts`

**Interfaces:**
- Produces `targetReport(query, user): Promise<TargetReportResponse>` for `GET /finance/target-report`.
- `TargetReportResponse.rows` exposes `date`, `discount`, `beforeDiscount`, `afterDiscount`, `paid`, `operation`, and `type`; `totals` exposes subscription, locker, sales, and grand totals.

- [ ] **Step 1: Write failing Target Report tests**

```ts
it('uses target_employee_id, not employee_id, for sales target rows', async () => {
  prisma.sales_quick_sales.findMany.mockResolvedValue([
    { target_employee_id: 4, employee_id: 99, subtotal: dec('100'), discount_amount: dec('10'), collected_amount: dec('50'), sale_date: '2026-09-20', sale_type: 'customer' },
  ]);
  const result = await service.targetReport({ branchId: '2', employeeId: 4, operationType: 'sales' }, levelOne);
  expect(result.rows).toEqual([expect.objectContaining({ operation: 'مبيعات', paid: '50.00' })]);
});

it('forces Level 2 to its own employee and current month', async () => {
  await service.targetReport({ branchId: '99', employeeId: 98, fromDate: '2020-01-01', toDate: '2020-01-31' }, levelTwo);
  expect(prisma.sales_quick_sales.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ target_employee_id: levelTwoEmployeeId }),
  }));
});
```

- [ ] **Step 2: Run Target Report tests to confirm failure**

Run: `npm test -- daily-closing-target.service.spec.ts --runInBand`

Expected: failures for the missing target report method and scope behavior.

- [ ] **Step 3: Implement Target DTO, scope resolver, rows, and totals**

Add `TargetReportQueryDto` with validated `branchId`, `employeeId`, `operationType: subscriptions | sales | all`, `fromDate`, and `toDate`. For Level 2 resolve the linked employee record from the authenticated account and ignore caller-provided employee/date. For Level 3 validate the requested employee belongs to the locked branch and force the calendar month. Query subscription types with `is_part_of_target: true`; include all locker types; query quick sales by `target_employee_id` only. Do not filter based on paid status, members, or customers. Compute grand totals from `paid_amount`/`collected_amount` only.

- [ ] **Step 4: Add controller endpoint and permission**

Add `@Get('target-report')` using the same financial-report view permission and current user injection, delegating to `targetReport`.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- daily-closing-target.service.spec.ts --runInBand`

Expected: exit 0 for all three operation types, all target totals, Level 2/3 restrictions, target employee source, and non-member/unpaid records.

- [ ] **Step 6: Record checkpoint**

Record changed files and test output.

### Task 5: Add Daily Closing frontend page and route

**Files:**
- Create: `frontend/src/pages/reports/finance/daily-closing.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/reports/hub.tsx`
- Modify: `frontend/src/types/finance.ts`
- Test: `frontend/src/pages/reports/finance/daily-closing.spec.tsx`

**Interfaces:**
- Consumes `GET /finance/daily-closing` response from Task 3.
- Produces route `/reports/finance/daily-closing` and Arabic RTL report output.

- [ ] **Step 1: Write a failing page test**

```tsx
it('renders Daily Closing section and grand totals returned by the API', async () => {
  mockFinanceGet('/finance/daily-closing', dailyClosingFixture);
  render(<DailyClosingReportPage />);
  expect(await screen.findByText('التقفيل اليومي')).toBeInTheDocument();
  expect(screen.getByText('صافي الربح')).toBeInTheDocument();
  expect(screen.getByText('1,250.00')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test to confirm failure**

Run: `npm test -- daily-closing.spec.tsx --runInBand`

Expected: failure because the page and route do not exist.

- [ ] **Step 3: Implement RTL filters, report sections, and exports**

Use the established report shell, branch filter, date range filter, finance API client, and export utilities. Render Regular, Private, Locker, Normal Sales, Protein Sales, Purchase Returns, Purchases, Supplier Payments, Expenses, Subscription Refunds, Total Revenue, Total Outflows, Net Profit, Total Cash, and Total KNET. Disable/lock controls according to server-reported/effective user scope but treat the API as authoritative. Include report totals in Copy, Excel, and Print data.

- [ ] **Step 4: Register lazy import, route, and report-hub card**

Export `DailyClosingReportPage` from `lazy-pages.ts`, add `/reports/finance/daily-closing` to `router.tsx`, and add a card to the financial reports hub with title `التقفيل اليومي`.

- [ ] **Step 5: Run frontend checks**

Run: `npm test -- daily-closing.spec.tsx --runInBand`

Expected: exit 0 with RTL section headings, totals, and effective filters visible.

- [ ] **Step 6: Record checkpoint**

Record changed files and test output.

### Task 6: Add Target Report frontend page and route

**Files:**
- Create: `frontend/src/pages/reports/finance/target.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/reports/hub.tsx`
- Modify: `frontend/src/types/finance.ts`
- Test: `frontend/src/pages/reports/finance/target.spec.tsx`

**Interfaces:**
- Consumes `GET /finance/target-report` response from Task 4.
- Produces route `/reports/finance/target` and a DataTable with the report's target rows.

- [ ] **Step 1: Write a failing Target Report page test**

```tsx
it('renders target rows and paid-based totals for the selected operation', async () => {
  mockFinanceGet('/finance/target-report', targetFixture);
  render(<TargetReportPage />);
  expect(await screen.findByText('تقرير التارجت')).toBeInTheDocument();
  expect(screen.getByText('القيمة قبل الخصم')).toBeInTheDocument();
  expect(screen.getByText('إجمالي التارجت')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the page test to confirm failure**

Run: `npm test -- target.spec.tsx --runInBand`

Expected: failure because the page and route do not exist.

- [ ] **Step 3: Implement filters, DataTable, totals, and export rows**

Build branch, employee, operation, and date controls with level-aware disabled states. Render the exact columns: date, discount, before discount, after discount, paid, operation, and type. Show subscriptions, locker, sales, and grand totals driven by operation type. Use the current employee-options hook and only offer employees returned for the effective branch. Include the totals footer in Copy, Excel, and Print.

- [ ] **Step 4: Register lazy import, route, and report-hub card**

Export `TargetReportPage`, add `/reports/finance/target`, and add the `تقرير التارجت` report-hub entry.

- [ ] **Step 5: Run frontend checks**

Run: `npm test -- target.spec.tsx --runInBand`

Expected: exit 0 with all financial columns, operation total, and export controls rendered.

- [ ] **Step 6: Record checkpoint**

Record changed files and test output.

### Task 7: Validate the integrated feature without data mutation

**Files:**
- Modify: only test fixtures/specs required by Tasks 1-6

**Interfaces:**
- Verifies all public API and page contracts created by Tasks 1-6.

- [ ] **Step 1: Run Prisma validation**

Run: `npm run prisma:validate`

Expected: exit 0.

- [ ] **Step 2: Run backend type check**

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run focused backend tests**

Run: `npm test -- daily-closing-target.service.spec.ts quick-sales.service.spec.ts --runInBand`

Expected: exit 0, covering the five Review Focus cases.

- [ ] **Step 4: Run frontend build and focused page tests**

Run: `npm run build`

Expected: exit 0, followed by the two report page specs with exit 0.

- [ ] **Step 5: Inspect migration and changed-file list**

Run:

```powershell
rg -n "DEFAULT|UPDATE|DELETE" backend/prisma/migrations/20260925194500_daily_closing_target_dimensions/migration.sql
```

Expected: no output. Record every changed file and all command outputs for handoff.
