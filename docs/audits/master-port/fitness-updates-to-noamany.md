# FITNESS TIME → Noamany: newest gym feature delta audit

**Audit date:** 2026-09-09  
**Source (read-only):** `/Users/fatmaatefkasem/Desktop/Gyms/Fitnesstimegym` (`S`)  
**Target (read-only except for this report):** `/Users/fatmaatefkasem/Documents/noamany-engineer26-8` (`T`)  
**Scope:** current filesystem state, including uncommitted files. Neither tree was treated as a clean release or as a database backup.

## Executive decision

Port the FITNESS TIME gym additions as bounded **club CRM**, **personal sales portal**, **trainer portal**, **payroll/commission**, **scanner**, and **subscription lifecycle** capabilities. Do not copy the source application shell, edition-scoping, global navigation, theme, seed data, or database wholesale.

The most important integration constraint is a hard route collision:

- FITNESS TIME uses `/sales?tab=…` for the personal salesperson workspace.
- Noamany already owns `/sales` and `/sales/*` for café/POS (`/sales/new`, `/sales/drafts`, `/sales/shifts`, `/sales/treasury`, `/sales/settlements`, `/sales/pos-admin`). Its router redirects `/sales` to `/sales/new`, its RBAC catalog assigns those paths to `gym-sales.sales.*`, and its workspace homes include `/sales/new` and `/sales`.
- Therefore the imported personal portal must live at **`/sales-portal?tab=today|reminders|leads|renewals|results`**. Preserve all Noamany POS routes. Adapt every source redirect, home-route decision, route-access helper, link, test, and bookmark migration accordingly.

This is not a cosmetic rename: mounting the FITNESS TIME page at `/sales` would silently replace the café landing route and corrupt role home navigation.

## Delta summary

| Capability | FITNESS TIME state | Noamany delta | Port decision |
|---|---|---|---|
| Personal sales portal | Complete five-tab workspace, reminders, renewals, cross-page navigation, guarded member preview | Source page/model/contracts are absent; `/sales` is occupied by POS | Port at `/sales-portal`; do not reuse `/sales` |
| Sales CRM/management | Leads, follow-ups, imports, distribution, targets, tiered commissions, defaults, rep activation/deactivation, transfers, branch assignment, reports | `club-sales` backend and management UI family are absent | Port as a new bounded module; consolidate management at `/club/sales-reports` |
| Trainer portal | Client/calendar/attendance/private/earnings workspace backed by trainer-portal APIs | New page/model/workspace are absent; older trainer files diverge | Port portal; merge existing trainer screens/services rather than overwrite |
| Persistent scanner | App-shell provider, hardware wedge, camera overlay, preview-only sales role | Provider/model/hooks/components are absent | Port globally, but keep route-owned scanners mutually exclusive and use a Noamany storage key |
| Branch scope | Scoped branch options and server enforcement across attendance, subscriptions, sales, trainers and payroll | Corresponding target files exist but differ or lack source tests | Merge server-first; never infer scope from the selector or widen on fallback |
| Payroll | Full monthly preparation/approval workflow with locks, snapshots, adjustments and notifications | Entire `club-payroll` backend and payroll UI family are absent | Port after commission integrity schema; retain Noamany finance/RBAC structure |
| Commission integrity | Receipt-based sales commission, refund reversals, trainer modes, settlement locks and immutable paid records | Pure contracts, ledgers and reconciliation schema are absent | Port as an accounting integrity unit, not isolated UI widgets |
| Subscription lifecycle | Branch pricing, queued renewals, renewal chain, single-flight save, correct ownership/context | Target subscription pages/services exist but differ | Three-way merge business behavior; never replace target subscription module wholesale |
| Other client requests | Checkout ratings, service debt, quick-service lead capture, printing policy, cashier visibility, expense approval | Mostly absent or older/divergent | Port after their schema/RBAC prerequisites |

“Absent” above means the source-specific file family has no target counterpart in the path/hash inventory. “Differs” means the same path exists but is not byte-equivalent; it must be reviewed as a merge, not assumed missing or safe to overwrite.

## 1. Personal sales portal

### Current source behavior

`S/frontend/src/pages/sales/index.tsx` is a personal, branch-scoped workspace with these exact tab labels and query values:

| Query value | Arabic UI label |
|---|---|
| `today` | `اليوم` |
| `reminders` | `التنبيهات` |
| `leads` | `العملاء المحتملون` |
| `renewals` | `متابعة التجديدات` |
| `results` | `النتائج والعضويات` |

The portal uses:

- `/club-members/sales-portal`
- `/club-leads/mine` (50-row server pages; the Today track presents 7 at a time)
- `/club-members/sales-renewals` (25-row pages; 15-second refresh)
- `POST /club-leads/renewal/:memberId/ensure`
- `GET /club-leads/:id`
- `POST /club-leads/:id/follow-up`
- `/club-leads/reminders` (25-row pages; 30-second refresh)
- `POST /club-leads/:id/reminders/complete`

Recent source fixes preserve selection across pages, clamp pages after removal, preserve a draft per client, support next/previous across page boundaries, and keep the six-stage Today track stable. Reminders distinguish optional `next_call_at` from `next_follow_up_at`, order overdue/upcoming items, and complete them atomically with an audit event. Converted/lost leads are excluded. Renewal activity clears obsolete reminders.

Member subscription context is not guessed: it exposes the latest authorized subscription number, package, actual stored paid amount (including zero), start date, and end date. Cross-branch, deleted, or ambiguous phone matches are rejected. The client detail is explicitly tested at 390 px, with RTL swipe and 48 px mobile / 56 px desktop navigation controls.

### Files to map

- `S/frontend/src/pages/sales/index.tsx` → new/merged `T/frontend/src/pages/sales-portal/index.tsx` (recommended target namespace)
- `S/frontend/src/pages/sales/sales-workspace-model.ts` and test → same model under `sales-portal/`
- `S/frontend/src/pages/sales/client-navigation.ts` and test → same model under `sales-portal/`
- `S/frontend/src/pages/sales/sales-reminders.tsx` → same component under `sales-portal/`
- `S/frontend/src/pages/club/sales-rep-options.ts` and test → target club shared option helper
- `S/frontend/src/pages/club/subscription-sales-owner.ts` and test → merge into the target subscription flow
- `S/frontend/src/hooks/use-registration-lead.ts` → merge into member registration
- Backend contracts/controllers are in `S/backend/src/modules/club-sales/` and `S/backend/src/modules/club-members/`; retain their API paths because they do not collide with the POS backend module.

### Access contract

Add the source resources `sales.portal` and `trainer.portal` to the target RBAC catalog without replacing Noamany’s catalog. Standard sales roles get portal view/update plus the minimum reception/member-read permissions. The preview-only role has exact client terminology **`السيلز — معاينة الأعضاء فقط`** and may scan/view only: no attendance, sale, invite, start-date change, edit, or delete.

Adapt `S/frontend/src/lib/portal-route-access.ts`, its tests, the router guard, and `S/backend/src/modules/rbac/workspace.service.ts` so a sales-only user’s home is `/sales-portal`, while café roles continue to land on `/sales/new` or the existing POS home.

## 2. Sales CRM and management workspace

The complete backend module is source-only: `S/backend/src/modules/club-sales/`.

### Public controller families

- `club-leads.controller/service`: own/team lists, reminders, atomic reminder completion, templates/import/export, distribution, rep transfer preview, rep activation, lead transfer, renewal candidates, renewal handoff/conversion, metadata, packages, detail/create/update/assign/delete and follow-up activity.
- `club-sales-dashboard.controller/service`: branch-scoped dashboard, exports and rep detail.
- `club-sales-reports.controller/service`: sales-rep/trainer reporting, export and trainer performance.
- `club-commission-settings.controller/service`: defaults, per-sales-rep settings and trainer settings.
- `club-invitations.controller/service`: invitation policy/package behavior.

Pure business contracts in the same module must accompany the services: `sales-commission-calculation.ts`, `sales-cash-commission.ts`, `sales-defaults.ts`, `target-period.ts`, `target-settlement.ts`, `trainer-performance.ts`, `lead-subscription-context.ts`, `lead-transfer-plan.ts`, `club-sales.constants.ts`, and `invitation-package.util.ts`.

### Management IA

Keep FITNESS TIME’s consolidation at **`/club/sales-reports`**, with overview/team/settings represented by query tabs rather than duplicate pages. Preserve these existing source route labels:

- `/club/leads` — **`العملاء المحتملون`**
- `/club/sales-dashboard` — **`نظرة عامة على المبيعات`** (legacy/bookmark redirect into the consolidated workspace)
- `/club/sales-settings` — **`التارجت والعمولة`** (legacy/bookmark redirect)
- `/club/sales-reports` — **`فريق المبيعات والتارجت`**

Source frontend files absent from Noamany and required for this workspace include:

- `S/frontend/src/pages/club/leads.tsx`
- `S/frontend/src/pages/club/sales-reports.tsx`
- `S/frontend/src/components/club/sales-pipeline-tabs.tsx`
- `sales-team-board.tsx`, `sales-defaults-panel.tsx`
- `sales-rep-settings-dialog.tsx`, `sales-rep-activation.tsx`, `sales-rep-transfer-dialog.tsx`
- `commission-tiers-editor.tsx`, `commission-calculation-preview.tsx`, `target-period-fields.tsx`
- `renewal-candidates-panel.tsx`, `subscription-expiry-reports.tsx`
- model/tests: `sales-team-view-model.ts`, `commission-preview.ts`, `sales-commission.ts`, `sales-defaults` backend tests, target-period/settlement tests, deactivation/transfer/multi-branch tests.

Default settings dynamically apply to new reps; explicit overrides survive default edits and may be reset/customized. Activation/deactivation previews branch-eligible reassignment, executes atomically, prevents stale/racing updates and sorts inactive reps separately. Actual sales and target are distinct, with remaining/exceeded/unset states. Do not reduce this to static CRUD forms.

## 3. Trainer portal and trainer management

The new personal trainer route is backed by:

- `S/frontend/src/pages/trainer/index.tsx`
- `S/frontend/src/pages/trainer/trainer-portal-model.ts` and test
- `S/frontend/src/components/trainer/trainer-portal-workspace.tsx`
- changed source component `components/trainer/trainer-schedule-calendar.tsx`
- `S/backend/src/modules/fitness/trainer-portal.controller.ts`
- `S/backend/src/modules/fitness/trainer-portal.service.ts` and source-only portal/workspace tests

Its exact section contract is `clients | calendar | attendance | private | earnings`. The backend exposes `/trainer-portal/schedule` and `/trainer-portal/dashboard`; date ranges are normalized to monthly bounds. Earnings are computed from actual eligible attendance even before a cron completes and exclude canceled attendance; private-attendance commission is included.

Management additions are separate from the personal portal:

- `S/frontend/src/pages/club/fitness/trainers/profile.tsx`
- `S/frontend/src/pages/club/fitness/trainers/performance.tsx`
- source-only `trainer-commission-dialog.tsx`, `trainer-commission-panel.tsx`, `trainer-rating-dialog.tsx`
- changed target-counterpart pages under `pages/club/fitness/trainers/{index,payments,ratings,settings}.tsx`
- changed backend `fitness/{trainers.controller,trainers.service,trainer-sync.service,salaries.controller}.ts`

Merge the changed trainer files. Preserve target-specific employee/account links and job-title rules; the source includes tests specifically for trainer sync, job-title filters, receipt commissions, refunds and branch-scoped performance.

## 4. Persistent reception scanner

Source-only frontend unit:

- `S/frontend/src/components/club/persistent-scanner.tsx`
- `S/frontend/src/components/club/camera-barcode-scanner.tsx`
- `S/frontend/src/components/club/use-hardware-scanner.ts`
- `S/frontend/src/lib/persistent-scanner-model.ts` and tests
- `hardware-scanner-wedge.test.mjs` and `scanner-panel-interactive.test.mjs`

The provider wraps the complete `AppShell`; the top bar owns the fixed toggle, so scanner state survives route changes. `pathOwnsItsOwnScanner(pathname)` prevents the persistent overlay from competing with a page-specific scanner, and `buildReceptionScanUrl(rawCode)` centralizes navigation.

Port the behavior, but do not copy the source local-storage key `fitness_time.reception.scanner.open`. Use a Noamany-owned stable key such as `noamany.reception.scanner.open`. Treat local storage as a UI preference only; every scan result must still be authorized server-side by branch and role. Preserve keyboard-wedge handling, camera permission/unsupported/error states, focus safety (typed form data must not become a scan), escape/close behavior, and the preview-only role restrictions.

## 5. Branch-scope changes

The source `useBranches` first requests the scoped `/club/branch-options` contract, falls back to `/branches` only for compatibility, and keys the query by user id so an admin all-branch payload is not reused after account switching. That file differs from Noamany:

- `S/frontend/src/hooks/use-branches.ts` → merge into `T/frontend/src/hooks/use-branches.ts`.

Server enforcement changes also differ in `branch-scope.service.ts`, `branch-scope.guard.ts`, `branches.controller.ts`, club attendance, quick services, subscriptions, trainer portal, trainers and payroll. Port their source tests, especially sales multi-branch, subscription/reception branch-scope, trainer payment scope and management scope.

Rules:

1. The selector never grants access; controllers/services resolve the permitted intersection.
2. No UI fallback may widen a scoped user to all `/branches` rows.
3. Sales-rep scope comes from the new multi-branch association, not an arbitrary selected branch.
4. Combined payroll runs must be hidden unless the user can see every employee branch in the run.
5. Trainer payments retain their saved `branch_scope`; overlapping incompatible scope/period payouts are rejected.

## 6. Payroll and commission integrity

### Monthly payroll

The complete source-only backend family is `S/backend/src/modules/club-payroll/` (controller, service, module, DTOs, pure `payroll-calculation`, `payday`, `period-lock`, `payroll-snapshot`, notifications/cron and tests). The complete source-only frontend family is `S/frontend/src/pages/finance/payroll/` (`workspace`, `preparation`, `approval`, `movement-history`, `payroll-api`, `payroll-model`, `types` and tests).

Use the exact Arabic navigation label **`المرتبات الشهرية`** for `/finance/payroll-preparation` and **`اعتماد وصرف المرتبات`** for approval. Cairo’s current calendar month is the unit of work; the server rejects partial/cross-month runs and clamps payday to month end. Draft runs persist, open runs refresh unpaid commissions (on open and every 60 seconds), submit recalculates under lock, and paid runs are immutable. Additions, bonuses, deductions and notes are append-only movements with creator and UTC timestamp. A stale refresh blocks submission.

Backend endpoints under `/finance/payroll` cover list/detail/timing/create, item adjustments, submit, refresh, per-item approval and approve-all.

### Commission rules that must remain atomic

- Sales commission is earned from paid receipts at collection time, including installments on old subscriptions; ownership, amount and rate basis are snapshotted.
- Refunds reverse the original commission even if rate or owner later changes. An unsettled reversal rolls forward. Unknown historic sources block the employee’s settlement instead of silently paying zero or a partial amount.
- Trainer earnings share one source across profile, report, payroll and direct payout. Class attendance is actual/cancel-safe; private commission uses the saved snapshot; sold-subscription commission is separate.
- Trainer commission mode is explicit: attendance, tiers instead, or attendance plus target bonus. The default is attendance.
- Trainer subscription refunds preserve source ownership/amount, support partial payout/negative payroll adjustment, and never double-post expenses/general-ledger entries.
- Payroll and direct payout share an InnoDB employee lock; overlap is rechecked immediately before payment. Excessive deductions are rejected.

Source-only support files include `backend/src/modules/fitness/trainer-earnings.ts`, `trainer-receipt-commissions.ts`, `trainer-subscription-refunds.ts`, plus frontend `trainer-commission-*` and `lib/commission-preview.ts`. Port tests before wiring UI actions. Historical ambiguity requires reconciliation; never invent old rates or owners and never auto-delete a prior overpayment.

## 7. Subscription, reception and other client-facing deltas

These are part of the same release train and should not be separated from their data contracts:

- **Renewal chain and single-flight save:** `S/backend/src/modules/club-subscriptions/club-subscription-renewal.service.ts`, lifecycle service/tests; `S/frontend/src/lib/subscription-renewal.ts`; `subscription-renewal-dialog.tsx`; save-single-flight and conflict tests. Renewal is explicit and serial, retains the sales owner, writes CRM activity, and never guesses “renewed” from another unrelated package.
- **Branch-specific package prices:** subscription-type branch-price loader/service/UI. Target subscription type/select/report pages differ; merge rather than replace.
- **Actual subscription context:** reception/profile/sales renewal cards show actual stored paid amount (including zero), package and dates via an authorized batched lookup.
- **Checkout and trainer ratings:** `member-checkout-model.ts`, `use-member-checkout.ts`, `trainer-rating-dialog.tsx`, and checkout/rating backend tests. A rating is linked uniquely to attendance.
- **Quick-service lead capture:** `creates_sales_lead` allows a configured quick service to create a CRM lead.
- **Club service debt:** complete source-only `S/backend/src/modules/club-service-debts/` module; port its permissions and accounting behavior with it.
- **Printing:** source-only `use-club-printing-policy.ts`, `club-printing.ts` and tests plus changed receipt/paid-flow screens. Auto-print applies to paid subscriptions/payments/quick services and approved paid expenses, with a clear reprint action if the browser dialog is blocked.
- **Cashier visibility:** policy `allow_staff_view_all_cashiers`; source daily-cashier/subscription reports differ. Enforce it in the API, not by hiding a client filter only.
- **Expense approval:** `require_expense_approval`; when disabled, creation auto-approves and posts transactionally.
- **Plan conversion:** transfer records capture destination subscription, consumed/credit/refund/additional-paid values, destination sessions and payment method.

## 8. Database migration ledger

All of these Prisma migrations exist in FITNESS TIME and are absent by directory name in Noamany:

| Order | Migration | Primary contract |
|---:|---|---|
| 1 | `20260805210000_subscription_plan_conversion` | Transfer/conversion financial snapshot |
| 2 | `20260824120000_fitness_time_sales_crm` | Leads/follow-ups/invitations, sales/trainer settings and tiers, CRM policies |
| 3 | `20260825090000_trainer_checkout_ratings` | Attendance-linked unique trainer rating |
| 4 | `20260825120000_target_periods_and_trainer_members` | Target modes/start/end/days |
| 5 | `20260826150000_fin_payroll_workflow` | Payroll runs/items/adjustments and target settlements |
| 6 | `20260827190500_quick_service_lead_toggle` | Quick service `creates_sales_lead` |
| 7 | `20260827203000_sales_lead_activity_workflow` | Follow-up activity type/answered/interests and next follow-up |
| 8 | `20260828210000_payroll_approval_locking` | Payday, paid-by/at, approval notifications |
| 9 | `20260829160000_subscription_type_branch_prices` | Branch-specific subscription pricing |
| 10 | `20260830123000_subscription_renewal_chain` | Unique self-linked renewal lineage |
| 11 | `20260901120000_cashier_visibility_policy` | Staff all-cashier visibility policy |
| 12 | `20260902120000_sales_rep_multi_branch` | Sales-rep/branch association |
| 13 | `20260906120000_sales_commission_tier_label` | Human tier label |
| 14 | `20260907120000_trainer_private_commission_percentage` | Explicit private commission percentage/backfill |
| 15 | `20260907180000_sales_rep_active_flag` | Sales-rep activation state |
| 16 | `20260908020000_crm_completion` | Expense approval, receipt-print flags, qualified→converted correction/audit |
| 17 | `20260908030000_commission_payroll_integrity` | Commission/refund ledgers, employee locks, trainer receipt/refund sources, payroll source snapshot |
| 18 | `20260908040000_sales_workspace_defaults` | Club sales defaults and per-rep override flag |
| 19 | `20260908120000_sales_call_reminders` | Separate next-call timestamps |

FITNESS TIME also has live-upgrade SQL files under `S/deploy/database/`, including sales CRM, target period, trainer rating, central printing/sales ownership, payroll, lead activity, payroll approval, service debt, cashier visibility, grace sessions and employee-account repair scripts. These overlap Prisma intent. **Do not execute both tracks.** Before any port, produce a target schema watermark and an object-by-object preflight for tables, columns, indexes, constraints and backfill state; choose one authoritative migration path and make it idempotent for the target’s actual schema.

The migrations are semantically ordered. In particular, do not introduce payroll UI before payroll and commission-integrity tables/locks exist; do not expose reminders before CRM activity and call fields exist; do not enable rep multi-branch selection before server scope enforcement exists.

## 9. Branding, data and architecture constraints

- Keep Noamany logos, product name, colors, typography, print headers, receipt identifiers and translation vocabulary. Do not copy FITNESS TIME `PRODUCT.md`, `DESIGN.md`, global CSS/tokens, assets, locale bundle wholesale, or `fitness_time.*` browser keys.
- Preserve Noamany’s café/POS, inventory, procurement, HR, finance, accounting and app-management routes. The FITNESS TIME edition/nav/router is narrower and is not a safe replacement.
- Preserve existing member, employee, account, branch, subscription, receipt, journal and upload IDs. Do not import a source dump, release bundle, `.env`, credentials, local uploads or demo data.
- Merge `app.module.ts`, router/lazy-pages, sidebar/nav, RBAC catalog/defaults and workspace home logic additively. Never replace Noamany’s custom roles or permission matrices.
- Keep all branch, member-photo, subscription-context, payment, refund and payroll authorization on the server. Client query keys and hidden controls are defense-in-depth only.
- Data corrections in `crm_completion` and commission history are visible business mutations. Run dry-run counts and retain an audit/export before applying them. Unknown historical commission ownership remains blocked for manual reconciliation.
- Paid payroll items, commission sources and accounting postings are immutable/audited records. Migration retries must not duplicate expenses, general-ledger entries, payouts, activities or refunds.

## 10. Recommended port sequence and acceptance gates

1. **Namespace/RBAC contract:** reserve `/sales-portal`, add resources and workspace-home mapping, retain all POS routes; add route collision tests first.
2. **Schema foundation:** CRM → ratings/targets → payroll → branch prices/renewal → multi-branch → activation/defaults/reminders → commission integrity, after target-specific preflight.
3. **Backend domains:** club-sales and branch scope, renewal/subscription context, trainer portal, payroll/commission, service debts, printing/cashier/expense policy.
4. **Personal portals:** sales portal and trainer portal, then persistent scanner at the app shell.
5. **Management UI:** consolidate sales management at `/club/sales-reports`; merge changed trainer/subscription/finance screens.
6. **Operational reconciliation:** historic commission exceptions, employee/account links, role assignments and branch mappings before enabling payouts.

Minimum acceptance gates:

- `/sales`, `/sales/new`, `/sales/drafts`, `/sales/shifts`, `/sales/treasury`, `/sales/settlements` and `/sales/pos-admin` still resolve to Noamany POS for their existing roles.
- `/sales-portal?tab=…` is reachable only with `sales.portal`; each tab survives refresh/back/forward and unauthorized member/branch data never renders.
- Sales-only, trainer-only, café-only, finance approver, branch manager and super-admin users each land on the correct home and cannot cross mutation boundaries.
- Scanner state survives navigation, never duplicates a page-owned scanner, and scan preview cannot mutate member state for `السيلز — معاينة الأعضاء فقط`.
- Lead pagination/reminders/renewal conversion remain stable under refresh and racing updates; duplicate renewal submission is prevented.
- Commission/refund/payroll tests prove single-source settlement, overlap locks, immutable paid snapshots, no duplicate postings and explicit reconciliation failures.
- Responsive review covers at least 390×844 (mobile contract), 768×1024 (tablet), 1280×800 and 1440×900, in Arabic RTL and English LTR, light/dark where supported. Validate keyboard navigation, focus restoration, touch/swipe, long Arabic labels, loading/empty/error/stale states, camera denial and print-dialog failure.

## Source evidence

The behavior descriptions above are grounded in the source’s current files and its dated verification notes, notably:

- `S/docs/audits/SALES-WORKSPACE-20260908.md`
- `S/docs/audits/SALES-TODAY-FIX-20260908.md`
- `S/docs/audits/LEAD-DETAILS-20260908.md`
- `S/docs/audits/CLIENT-REMINDERS-20260908.md`
- `S/docs/audits/COMMISSIONS-PAYROLL-FIXED-20260908.md`
- `S/docs/audits/monthly-payroll-20260908.md`
- `S/docs/CLIENT-REQUESTS-COMPLETED-20260908.md`

The report is an architecture/delta audit, not authorization to apply source migrations or copy source files unchanged.
