# Daily Closing and Target Reports Design

## Purpose and scope

Implement two financial reporting features only: Daily Closing and Target Report. Monthly Analysis is not changed. The reports use only the current Prisma schema and current application database; no legacy lookup, historical migration, default value, or backfill is permitted.

## Architecture

Add a report-specific service and DTOs inside the existing `finance` module, exposed by `FinanceReportsController` as `GET /finance/daily-closing` and `GET /finance/target-report`. The service depends on Prisma and the existing branch-scope and user/employee resolution services. It returns display-ready, decimal-safe totals and target rows; the React pages only render and export that trusted response.

Monthly Analysis and its code path remain untouched. Existing finance report APIs remain compatible.

## Authorization and time scope

The backend determines all effective filters:

- Level 1 may select any permitted branch or all branches and a valid inclusive date range.
- Level 2 is locked to its branch. Daily Closing is forced to the current operating day. Target Report is forced to the current calendar month and to the employee associated with the authenticated account.
- Level 3 is locked to its branch. Daily Closing is forced to the current operating day. Target Report is forced to the current calendar month and accepts only an employee from that branch.
- A requested branch of 3 expands to `[3, 8, 9]`; every other branch remains itself. The all-branches option is only accepted for an unrestricted user.
- Foreign branch, employee, date, or invalid range requests return a validation/authorization error rather than widening results.

## Data changes

One additive migration and corresponding Prisma schema update will add:

- `sales_quick_sales.target_employee_id`, nullable, indexed, and related to `employees.id`.
- `inv_categories.daily_closing_classification`, nullable enum `NORMAL | PROTEIN`.

Quick-sale create and update flows accept an optional `targetEmployeeId`; when present it must identify an employee in the effective branch scope. No existing row is changed.

## Daily Closing aggregation

Each section is independently queried with its prescribed operational date and branch field: regular and private subscriptions, lockers, Normal and Protein cafe sales, purchase returns, purchase invoices, supplier payments, expenses, and subscription refunds. Private subscriptions use the explicit private-package relation. Cafe classification uses only the saved quick-sale header category and the category classification. Purchase returns and other soft-deletable entities exclude `is_deleted` rows.

Revenue is `regular + private + lockers + normal + protein`. Outflows are `purchases + supplier payments + expenses + subscription refunds - purchase returns`. Net profit is revenue minus outflows.

Cash means `cash`; KNET means every other explicit payment method, per product-owner decision. Cash/KNET totals are returned for the five receipt sections only.

## Target aggregation

The service returns normalized rows from target-eligible subscriptions, all locker subscriptions, and quick sales with `target_employee_id`. Operation filtering supports only `subscriptions`, `sales`, and `all`. Row values retain before-discount, discount, after-discount, paid amount, date, operation, and type. Grand totals are always sums of paid amounts.

## Frontend

Add RTL finance report pages and route/navigation entries. Daily Closing provides branch and date filters appropriate to the user level and section cards/totals. Target Report provides branch, employee, operation, and date filters appropriate to the user level plus a RTL DataTable. Both reuse existing report shell/export utilities and include Copy, Excel, and Print output with totals.

## Verification

Unit/integration tests cover branch expansion, role restrictions, every data source and date field, payment classification, category snapshot behavior, target operation totals, invalid requests, no leaked branches, and no data backfill. Required validation is `npm run prisma:validate`, `npm run typecheck`, and focused report tests.
