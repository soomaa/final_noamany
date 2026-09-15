# Noamany Master Upgrade Design

## Status and approved direction

The target is `/Users/fatmaatefkasem/Documents/noamany-engineer26-8`.

The upgrade combines three authoritative sources without replacing the target wholesale:

1. The target keeps Noamany identity, website, operational data, HR customizations, finance history, permissions, and existing working behavior.
2. `/Users/fatmaatefkasem/Desktop/Gyms/Fitnesstimegym` supplies the newest gym deltas, especially the personal sales workspace, sales CRM, trainer workspace improvements, persistent scanner, branch-scoped contracts, renewal/commission/payroll integrity, and their tests.
3. `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80` supplies the newest café/POS/inventory/procurement behavior from its current working tree, including uncommitted 9 September 2026 changes.
4. `/Users/fatmaatefkasem/Downloads/application (1)` supplies the client's legacy intent, equations, and Arabic terminology for requested reports and workflows.

No source database, `.env`, credentials, uploads, customer history, cash/shift history, stock quantities, payroll history, or source branding is copied.

## Product outcome

Deliver one coherent Noamany gym system with:

- the latest proven gym operations from FITNESS TIME;
- the latest proven café behavior from ONE80;
- every client request represented in one acceptance ledger;
- fewer, better-organized pages using tabs, drawers, and drill-downs;
- desktop and mobile screenshots for every delivered user-facing requirement.

## Integration rules

### Preserve, merge, never overwrite blindly

- Same-path files are three-way reviewed. Noamany-specific behavior is retained unless it is demonstrably obsolete or conflicts with an explicit client request.
- Source-only business modules are added with their tests and schema prerequisites.
- Shared application files—Prisma schema, application module, router, lazy pages, sidebar, RBAC catalog, workspace routing, localization, finance bridges, and upload/printing infrastructure—are edited centrally after leaf modules are reconciled.
- Migrations are additive and idempotent against the actual Noamany schema. Overlapping Prisma and deployment SQL tracks are never both applied.

### Route ownership

Noamany's existing café POS keeps the established `/sales/*` routes:

- `/sales/new`
- `/sales/drafts`
- `/sales/shifts`
- `/sales/treasury`
- `/sales/settlements`
- `/sales/pos-admin`

The imported personal salesperson workspace uses:

- `/sales-portal?tab=today`
- `/sales-portal?tab=reminders`
- `/sales-portal?tab=leads`
- `/sales-portal?tab=renewals`
- `/sales-portal?tab=results`

This prevents the FITNESS TIME `/sales` portal from replacing Noamany's café POS.

### Brand and UX

- All imported surfaces use Noamany logo, receipt identity, Arabic-first copy, RTL behavior, and incumbent visual system.
- FITNESS TIME and ONE80 names, logos, colors, deployment hosts, storage keys, and release scripts are excluded.
- Source behavior is preserved while navigation is consolidated. A source route that only duplicates a tab becomes a redirect and does not create another sidebar item.
- Desktop and mobile views must expose clear loading, empty, error, permission, conflict, stock-shortage, and payment-mismatch states.

## Workstreams

### A. ONE80 café reconciliation

Update Noamany's existing café stack from the current ONE80 source:

- product categories, products, images, variants, recipes, price list, and raw materials;
- searchable POS, cart, compact review, editable rows, quantity controls, comments, member/customer/employee lookup, and current image-card improvements;
- configured payment methods, mixed payments, tendered amount, change/remaining, references, receipts, reprints, and 58/80 mm printing;
- shifts, handover, close report, drawer movement, payment-method totals, and historic invoice print;
- employee discount, daily free-drink rules, eligible categories, and backend daily revalidation;
- café customers, phone lookup, statistics, product feedback, dashboard, and reporting;
- inventory, opening stock, movement history, gym/internal issue, waste/reversal, stock-taking sessions and approval;
- suppliers, purchases, returns, invoices, supplier payments, and debt views;
- finance/accounting projection using stable source identities without duplicate ledger posting.

Noamany already shares many of these files with ONE80, so the operation is a reconciliation of 95 divergent and 69 source-only scoped files, not a fresh subsystem copy.

### B. FITNESS TIME gym delta

Port and merge:

- personal sales workspace and reminders;
- club sales CRM, team management, rep activation/deactivation, transfer, targets, defaults, tiered commission, and renewal follow-up;
- latest trainer portal/workspace behavior, earnings, rating, commission, refund, and branch filters;
- persistent app-shell scanner with USB keyboard-wedge and camera support;
- preview-only sales scan role;
- branch-scope hardening and multi-branch sales assignments;
- subscription renewal chain, branch prices, actual payment context, single-flight submission, plan conversion, service debt, printing policy, cashier visibility, and expense approval;
- monthly payroll/commission integrity only where it augments Noamany without replacing its HR/payroll engine.

The imported personal portal is namespaced under `/sales-portal`; existing POS routes remain unchanged.

### C. Client-request completion

The acceptance source is `docs/audits/master-port/client-requirements-matrix.md`, currently covering 40 rows: 6 complete, 15 partial, and 19 missing before implementation.

The required feature groups are:

- four-tab target report: subscriptions, private, sales with Protein/Bar, and sessions;
- role-template employee evaluations, monthly evaluations, reports, and HR app “تقييماتي”;
- member document collection and scan-first preview for member/staff/classes;
- central branch and men/women access scope;
- customer-service follow-up questions, answers, notes, and opinions report;
- café classification and reports for Protein, Bar, and Management Withdrawals;
- locker stock-taking and review;
- monthly analysis and controlled daily close;
- member-app branch trainers and calorie/macro contracts;
- online subscription package details, public payment methods, payment proof, admin review, and idempotent promotion into normal subscriptions;
- website CMS coverage, ticker removal, “اشترك الآن”, cart/store polish, and complete mobile QA.

Groups and surveys are hidden/disabled while historical data is retained. Café product categories are not affected.

## Minimal information architecture

The final sidebar avoids one entry per report or preset:

- **المبيعات:** personal `/sales-portal`; management consolidated at `/club/sales-reports`; leads at `/club/leads`.
- **المدربون:** personal `/trainer`; management under trainer directory/profile/performance.
- **الكافيه والمخزون:** daily POS remains `/sales/new`; catalog, inventory, procurement, reports, and settings use their existing Noamany families with tabs instead of duplicate sidebar entries.
- **خدمة العملاء:** one `/club/customer-service` workspace with follow-up, questions, and opinions tabs.
- **التارجت:** one `/club/targets` report with four tabs and shared person/month/branch/section filters.
- **اللوكر:** inventory and review are tabs in `/club/lockers`.
- **تقارير الاشتراكات:** daily, period, monthly analysis, and daily close remain tabs/presets in the existing reporting area.
- **الاشتراكات الأونلاين:** one admin queue `/club/subscriptions/online`; public detail and checkout remain on the public website.

## Evidence and review contract

All review evidence lives under:

`review/client-requirements-2026-09-09/`

The root `INDEX.md` links every client requirement to:

- current status;
- source of behavior;
- final Arabic page name and route;
- backend/API and permission contract;
- automated verification command and result;
- `desktop.png` at 1440×900;
- `mobile.png` at 390×844;
- extra state images where required, such as payment mismatch, shift-close print, stock shortage, scanner preview, proof upload, approval, and rejection.

A route or compiled page is not completion evidence. User-facing requirements require realistic seeded data, browser interaction, and screenshots. Hardware-dependent scanner, camera, printer, WhatsApp, and payment claims are explicitly labeled until verified on the real device/service.

## Delivery order

1. Establish target schema watermark, route/RBAC collision tests, and review ledger.
2. Reconcile ONE80 café leaf modules and tests, then shared schema/finance/RBAC/router integration.
3. Port FITNESS TIME sales/CRM/scanner leaf modules and tests, then shared branch/subscription/trainer/payroll integration.
4. Implement missing client workflows on the stabilized transaction classifications and access scopes.
5. Complete public subscription and website work.
6. Run full tests/builds, migration rehearsal, role/branch/section checks, Impeccable audit, desktop/mobile browser QA, and evidence indexing.

## Acceptance criteria

- Existing Noamany HR, café, finance, website, data, branding, and permissions are preserved unless an explicit client requirement changes them.
- Current ONE80 café behavior and its 9 September working-tree updates are present in Noamany.
- Current FITNESS TIME sales portal, CRM, trainer, scanner, and selected integrity improvements are present without taking over POS routes.
- All 40 ledger rows have an accountable implementation status; none is hidden in a miscellaneous bucket.
- No redundant sidebar pages are introduced for presets, roles, report types, or simple drill-downs.
- Backend/frontend/website builds and all applicable tests pass with fresh output.
- Additive migrations are rehearsed against an isolated Noamany-compatible database before deployment.
- Each delivered user-facing row has the required desktop/mobile screenshot and route documentation.

## Explicit anti-goals

- Do not turn FITNESS TIME into the target.
- Do not copy all of FITNESS TIME or all of ONE80.
- Do not replace Noamany's database or import source operational data.
- Do not replace Noamany HR/payroll with a source payroll engine.
- Do not mount the personal sales portal at `/sales`.
- Do not create one page per filter, role, report segment, or status.
- Do not declare a requirement complete from source inspection, mocks, or compilation alone.
