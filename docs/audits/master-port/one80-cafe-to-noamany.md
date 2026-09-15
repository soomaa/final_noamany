# ONE80 café → Noamany master-port audit

Audit date: 2026-09-09. Source: `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80` current working tree (including uncommitted changes). Target: this Noamany repository. This is a read-only audit; no production source was changed. The port must be code/schema-only: preserve Noamany branding, identities, data, migrations, CRM/trainer/community/portal/HR behavior, and never copy source databases, uploads, secrets, `.env` files, catalog TSVs, deployment scripts, or ONE80 assets/labels.

## Executive result

Noamany is already partially ported: its backend already contains and registers `InventoryModule`, `CafeProductsModule`, `ProcurementModule`, and `SalesModule`, and its frontend already contains the principal café, inventory, procurement, and POS page families. This must therefore be a selective merge, not a directory replacement. The main missing runtime slices are café dashboard, waste/loss, the latest packaged-material and POS workflows, payment snapshots/shift attribution/business dates, employee daily drink benefits, and their finance/accounting and RBAC glue.

Two decisions block a claim of exact parity: (1) monthly employee café deductions in ONE80 are coupled to ONE80 payroll/HR tables and require a Noamany-native payroll adapter, and (2) secure cashier handover depends on session-aware staff authentication and must retain Noamany cookie/identity semantics. Everything else can be ported additively.

## Exact backend port map

| Area | Source files/families | Required action in Noamany |
|---|---|---|
| Café catalog | `backend/src/modules/cafe/{cafe-products.controller,cafe-products.service,cafe-products.service.spec}.ts` | Merge changed controller/service/spec into the existing module; keep unchanged module/DTO files in place. |
| Café dashboard | `backend/src/modules/cafe-dashboard/{controller,module,service,service.spec}.ts` | Add the complete module and register only it in the existing `AppModule`. |
| Waste/loss | `backend/src/modules/cafe-waste/{controller,module,service,service.spec}.ts`, `dto/cafe-waste.dto.ts` and DTO spec | Add complete module, models/migrations, RBAC, routes, shift and finance/inventory integrations. |
| Inventory | Changed controllers for brands, categories, composite products, consumables, main categories, manufacturers, opening stocks, product branches/products/service consumables/spare parts/stock/storages/subcategories/unit templates/warehouses; changed `dto/inventory.dto.ts`, `inventory-location.service(.spec)`, `inventory-transactions.service.spec`, `products.service(.spec)`, `stock-taking.{controller,service}.ts`; source-only `stock-taking.service.spec.ts` | Selectively merge permission/branch-scope updates and functional packaged-material, recipe-unit, search, and stock-taking-item edit/delete behavior. Do not overwrite target-specific inventory extensions. |
| Procurement | Changed approvals, debit notes, goods receipts, lookup/settings, purchase invoices/orders/returns, quick POs, quotations, requisitions, RFQs, supplier contracts/dashboard/payment schedules/reports/settings controllers; `dto/procurement-ext.dto.ts`; `supplier-invoices.service(.spec).ts` | Merge permission changes and packaged/base-unit stock posting into existing procurement. Preserve Noamany approval/accounting rules where stricter. |
| POS/sales | Add `completed-sale-stock-plan.util.ts`, `pos-employee-options.controller.ts`, `sale-payment-summary.util.ts`, `sale-stock-balance.util.ts`, `shift-close-report.ts`; merge billing statements, bookings, POS admin, payment validation, quick sales, shifts and shift sessions controllers/services/DTOs/module/utils | This is the central parity merge: customers/members, employee benefits, mixed/catalog payments, draft/finalize/edit/refund/cancel, optimistic revisions, inventory delta planning, shift board/close receipt/handover, settlement attribution and item feedback. |
| Finance | Add `cafe-finance.util.ts`, `drawer-finance.util.ts`, `reconcile-cafe-finance.ts` and their specs; merge finance DTO, expenses/revenues, reports, user scope and system-expense utility | Preserve Noamany approvals and stable source identities; never replace the whole finance module. |
| Accounting | Add `module-ledger.quick-sale-edit.spec.ts`; merge reports, accounts seeds, journal/ledger/module-ledger services and reversal specs only where café posting needs it | Extend Noamany chart/ledger mappings additively. Do not replace account seeds or delete/rename existing accounts. |
| Auth/branch | Source adds staff-session policy/service, auth session tests/cookie/JWT tests/branch-option behavior | Port only the minimum session-aware handover and branch-option behavior; rename/adapt all cookie and identity semantics to Noamany. |
| Payroll | Source `finance-payroll` and `payroll_cafe_allocations` are coupled to ONE80 HR/payroll | Do not copy wholesale. Implement a Noamany payroll bridge adapter after ownership/status/posting contracts are mapped, or explicitly defer monthly employee deduction. |

Shared dependencies: source modules rely on `common/dto/list-result.ts`, `common/preview/index.ts`, `common/retry-unique.ts`, `common/utils/units.ts`, and `common/validators/index.ts` equivalents already present in the target; merge the differing `common/types/jwt-user.ts` contract and add/adapt the missing `common/utils/cairo-date.ts`. Code extensions should use Noamany auth/branch/accounting services rather than importing ONE80 adapters.

Do not replace `AppModule`: source changes also remove Noamany community/portal/administrative/mobile modules and add unrelated ONE80 gym/HR modules. The café port should only add `CafeDashboardModule` and `CafeWasteModule` to the already-registered café/inventory/procurement/sales set, plus a narrowly designed payroll bridge adapter if approved.

## Prisma schema and additive migrations

Required Prisma-todo models/tables and field deltas, to be expressed as new Noamany migrations after checking actual deployed state:

- Add `cafe_waste_reasons` and `cafe_waste_records`; relate waste records to shift sessions and inventory/finance postings.
- Add `inv_product_packages` and selectively merge packaged-material fields in `inv_products`, `inv_movements`, `inv_transactions`, `inv_opening_stocks`, and `prc_supplier_invoice_items`.
- `sales_quick_sales`: add nullable `employee_benefit_date varchar(10)`, `employee_free_drinks int default 0`, nullable `business_date varchar(10)`, `inventory_posted boolean default true`; add indexes for business date, `(branch_id,business_date,status)`, employee, partner, sale type, and `(employee_id,employee_benefit_date,status)`.
- `sales_quick_sale_items`: add `free_quantity int default 0` and indexes on café and inventory product foreign keys.
- `sales_billing_statements`: add nullable `shift_session_id`, relation, and index.
- `sales_pos_payment_methods`: add `requires_reference`.
- `sales_pos_payments`: add `catalog_payment_method_id`, payment method code/name snapshots, relations/indexes.
- Extend `sales_shift_sessions` relations to billing statements and waste records.
- Selectively reconcile café-related deltas in `acc_journal_entries`, `fin_expenses`, `fin_revenues`, and `branch_settings`; do not replace the target definitions.
- `staff_auth_sessions` is required only if secure handover/session revocation is adopted. `payroll_cafe_allocations` and `payroll_monthly_events` must not be copied until redesigned against Noamany payroll.

Source migrations to translate into additive, Noamany-named migrations: `20260802120000_packaged_materials_inventory_mode`, `20260821120000_cafe_waste_and_loss`, `20260821121000_cafe_waste_rbac`, `20260822130000_cafe_waste_shift_session`, `20260826230000_pos_payment_method_snapshots`, `20260901183000_billing_statement_shift_attribution`, `20260903120000_quick_sale_business_date`, and `20260908001000_cafe_employee_daily_allowance`. Review `20260709100000_hot_path_indexes` and `20260826190000_hr_query_performance_indexes` and copy only café/finance/sales indexes. `20260826070000_staff_auth_sessions` is conditional on secure handover. Do not copy `20260908003000_monthly_payroll_events` wholesale because it carries ONE80 HR engine changes.

The daily-allowance migration is precisely three columns plus one index: `sales_quick_sales.employee_benefit_date`, `sales_quick_sales.employee_free_drinks`, `sales_quick_sale_items.free_quantity`, and `idx_employee_daily_drinks(employee_id,employee_benefit_date,status)`. These are sale/item facts, not employee-master fields; do not add benefit counters to Noamany employees.

All new migrations must be forward-only and data-safe: no baseline replay, reset, `DROP`, `TRUNCATE`, operational inserts, uploaded media, employee/customer/catalog copying, or assumptions about empty tables. Preserve every target-only legacy mapping/import audit/geofence/trainer/community/mobile/portal migration.

## Route contracts and collision analysis

New routes absent in target are:

- `GET /cafe-dashboard/summary`.
- `GET /cafe-waste/catalog`, `POST /cafe-waste/preview`, `GET|POST /cafe-waste/reasons`, `PATCH /cafe-waste/reasons/:id`, `GET /cafe-waste/analytics`, `GET /cafe-waste/records`, `POST /cafe-waste/records`, `POST /cafe-waste/records/:id/reverse`.
- `PATCH|DELETE /stock-taking/:sessionId/items/:itemId`.
- `GET /pos/employee-options`.
- `PUT /quick-sales/:id/completed`; `GET /quick-sales/customers`, `/customers/:kind/:key`, `/customers/lookup`, `/customers/member-lookup`, `/customers/member-search`, and `/employees/:employeeId/benefits`.
- `PUT /shift-sessions/:id/close-own`, `GET /shift-sessions/:id/close-report`.

Existing top-level contracts remain `/cafe-products`, inventory resource controllers, procurement resource controllers, `/quick-sales`, `/billing-statements`, `/bookings`, `/shifts`, `/shift-sessions`, and `/pos-*`; merge DTO/response/permission behavior without renaming them. There is no source `@Controller('sales')`, so the internal Nest class name `SalesModule` does not create an HTTP `/sales` collision. Noamany already owns that module name; extend it rather than registering a second module/controller family.

`CreateQuickSaleDto` parity includes `branchId`; customer identity; `saleType` (`customer|employee|partner`) and employee/partner IDs; `billingCycle` (`immediate|daily|monthly`); café/product/variant item identifiers, server-priced quantity and notes; discount/tax; cash/card/wallet/transfer/mixed payment plus catalog method/reference and split payments; warehouse, hold, ingredient-shortage override, comments; and concurrency field `expectedEmployeeFreeDrinks`. Completed-sale edit adds `expectedRevision`. The service must ignore client authority over prices/benefits, re-price server-side, and revalidate benefit use across branches/statuses.

Employee benefit POS settings are `employee_discount_percentage`, `employee_discount_enabled`, `employee_free_drinks_enabled`, `employee_free_drinks_daily`, and `employee_free_drink_categories`. Daily usage must include the correct draft/completed/refunded lifecycle and be concurrency-safe. Shift switch accepts credentials plus closing balance, transfer, cash drop, and shortage reason.

## RBAC

Merge into the target catalog/seed; never replace target roles:

- Add `gym-sales.sales.bookings` (`/sales/bookings`, list/view as supported).
- Change the source-equivalent draft action requirement from list to approval only after mapping existing Noamany roles.
- Add `club.cafe.dashboard` (`/club/cafe/dashboard`, report), `club.cafe.waste` (`/club/cafe/waste`, view/create/update/export/print/audit), and `club.cafe.customers` (`/club/cafe/customers`, report).
- Preserve existing permissions for new receipt, drafts, shifts, treasury, settlements, POS admin, café categories/products/prices/reports/feedback, inventory and procurement.

Controllers additionally tighten branch scope and permission checks across inventory/procurement. Shift start/current/switch and close-own intentionally use authenticated/branch-scoped empty `@RequiresPermission()` in source, while management operations remain explicit; verify this policy against Noamany before copying. Add route/RBAC contract tests so catalog, guards, and frontend route visibility cannot drift.

## Finance/accounting/workforce behavior

`cafe-finance.util.ts` idempotently projects completed quick sales to revenue using `source_module=quick_sale`/sale-number source refs and COGS to `CAFE-COGS-${sale.id}`; reversals use `CAFE-REV-${sale.id}` and `CAFE-COGS-REV-${sale.id}`, including compatibility with legacy projection rows. `drawer-finance.util.ts` projects posted petty expenses as `DRAWER-${id}` but does not treat custody movements as expense. `reconcile-cafe-finance.ts` repairs projections in batches and must not manufacture sales, payroll, or ledger source transactions.

Quick sale completion must post inventory, GL/module ledger and finance projection transactionally; completed edits post inventory/accounting deltas with optimistic revision rather than mutating history; refund/reversal unwinds all projections. Purchase invoices/supplier payments, inventory issue/count, and waste likewise require their accounting/inventory/system-expense postings. Merge the corresponding module-ledger quick-sale-edit and reversal logic into Noamany mappings, retaining Noamany account IDs, approval flows and stable expense identities.

Monthly employee sales are the major workforce conflict. ONE80 reserves café allocations, blocks edit/refund/direct settlement, then marks invoices/finance paid when payroll posts and credits receivables rather than reducing salary expense. Its table references ONE80 HR payroll records. Exact parity requires a Noamany-owned adapter with explicit payroll-run lifecycle and rollback/idempotency tests; importing ONE80 payroll or adding employee-master benefit fields is out of scope.

Secure cashier handover validates staff credentials, issues/revokes session-aware tokens and uses `staff_auth_sessions`. If adopted, adapt `verifyStaffCredentials`, session policy, JWT strategy/logout and tests to Noamany user mapping and cookie names. Never copy `one80_access`, `one80_refresh`, ONE80 roles, or identity adapters.

## Frontend merge map

Add source-only pages `pages/cafe/{customers,waste-types,waste}.tsx`, `pages/cafe-dashboard/index.tsx`, `pages/inventory/stock-taking-workspace.tsx`, and the relevant sales helpers/specs for employee-benefit category selection, invoice-print access, new-receipt layout and treasury operating date. Merge, do not replace, differing café pages (`pos`, `products`, `purchases`, `reports`, route pages, supplier payments/suppliers), inventory pages (gym issue, opening stock, products, stock taking, transactions), and sales pages (bookings, drafts, new receipt, POS admin, settlements, shifts, treasury).

Add café components `pos-product-browser-frame`, `use-pos-cart-viewport`, and waste analytics/history/reasons/registration; add sales POS cash tools, mixed-payment panel, order review/payment dialogs, payment-method editor, shift close receipt and shift waste panel. Merge recipe/variant/category-grid and receipt/printing/shift-switcher changes. Target already has `touch-keypad.tsx`; add/adapt the missing `touch-keypad-context.tsx` and provider rather than duplicating the keypad.

Add/adapt shared helpers `completed-invoice-edit`, `employee-benefits`, `invoice-editor-access`, `saved-pos-receipt`, receipt/shift-close print helpers/tests, and route registration in Noamany `app/lazy-pages`, router, shell/nav and gym-sales/club route definitions. Do not copy `adapters/one80/authenticated-routes.ts` or `one80-cafe-dashboard-routes.ts` by name; express the same route behavior in Noamany routing. Reconcile hub/dashboard/type changes only where needed for café links.

Impeccable audit guidance flags the POS merge as a state-heavy operational UI: preserve visible loading/empty/error/success states, keyboard/touch accessibility, branch/shift context, destructive confirmation, responsive product/cart layout, and print readability. Existing Noamany visual tokens and brand remain authoritative.

## Source uncommitted changes that are in scope

Port the root frontend behavior, not its duplicate `caffe/frontend` mirror: `frontend/src/lib/product-image.ts` now accepts secure HTTPS images before upload fallback; new `product-image-input.ts` validates trimmed HTTPS URLs and safe stored relative upload paths while rejecting HTTP, malformed/script/traversal values; its test is new. `pages/cafe/products.tsx` adds validated link input, default fallback, safe normalized save, and 350 ms search debounce; `pages/cafe/pos.tsx` resolves/falls back broken images. `pages/sales/new-receipt.tsx` enlarges the POS image bubble and its layout spec records that contract.

Exclude untracked `one80-pos-products.tsv`, `one80-product-image-map.tsv`, materialization/map/hotfix scripts, deployment scripts, `caffe/frontend` duplicate edits, `.env`/uploads and all operational image/catalog data. Rewrite the otherwise-neutral product-image comments/tests to remove ONE80 naming.

## Verification/test gate

Port and run the source café dashboard/product/waste specs; inventory location/stock/transactions/products/stock-taking specs; procurement utilities and supplier-invoice specs; and the sales suites for billing-statement concurrency/shift attribution, completed-sale stock plans, customers, discounts, employee invoice/benefits/lifecycle, inventory mode, payment board/validation/summary, shifts/close report/handover/accounting/edit, quick-sale completed edit, and utility balance/math behavior. Run finance/accounting café projection, drawer expense, reconciliation, quick-sale edit and reversal specs. If handover is adopted, run staff-session/auth/JWT specs adapted to Noamany cookies.

Frontend gates include POS browser/recipe components, product image input/resolution, completed-invoice edit, employee benefits, invoice editor/print access, saved receipt, receipt branding, shift-close print, operating-date, new-receipt layout and existing target café tests. Finally run backend/frontend unit suites, TypeScript builds, Prisma format/validate/generate, migration dry-run against a copy of the target schema, and integration tests for complete→edit→refund, packaged stock, waste reversal, mixed payment, shift close/handover and finance reconciliation. Add a migration lint asserting no destructive SQL, data inserts, secrets, uploaded paths or ONE80 brand strings.

## Implementation order and open blockers

1. Freeze route/DTO/RBAC compatibility tests; add additive schema migrations.
2. Merge shared units/date/branch/auth primitives, inventory packaging, then procurement.
3. Merge quick-sale/POS/shift behavior and payment snapshots; add café dashboard/waste.
4. Integrate finance/accounting projections and reconciliation; then frontend/routes/print UI.
5. Decide and implement the Noamany payroll adapter and optional session-aware handover; execute the full gate above.

Blocking decisions: ownership/status mapping for Noamany payroll café deductions; whether session-revoking shift handover is required and which Noamany auth-session/cookie contract it must use; definitive Noamany ledger account mapping for café revenue/COGS/waste/drawer; and deployed-database inspection before final SQL to prevent duplicate columns/indexes. These are integration unknowns, not reasons to import ONE80 HR, identity, operational data or branding.
