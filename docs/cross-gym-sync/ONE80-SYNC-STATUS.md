# ONE80 Cross-Gym Sync Status

**Updated:** 2026-09-09

**Target:** `/Users/fatmaatefkasem/Desktop/nomany_hr/GYM/one80` through the Codex worktree `/Users/fatmaatefkasem/.codex/worktrees/6926/one80`

**Sources:** Fitness Time for CRM/sales/trainers/printing; PHAROS for member-app/packages/classes/trainers/branch isolation

**State:** Batches 1–6 implemented and verified; September 8 Fitness Time parity audit complete

## Safety Baseline

- ONE80 remains the base. HR, POS, Cafe, Accounting, inventory, and project-specific member fields stay authoritative.
- `/sales` and `/sales/*` remain ONE80 POS. Personal sales stays under `/sales-portal`.
- CRM writes use `club_sales_crm_leads` and `club_sales_crm_lead_follow_ups`. The ignored legacy `club_leads` table remains untouched.
- Database work is additive only. No destructive migration, rename, reset, reseed, or production connection is allowed.
- The worktree is detached and externally managed. Small commits are safe, but branch creation/handoff is an app-level finish action.
- The worktree reuses the original checkout's lockfile-identical `backend/node_modules` and `frontend/node_modules` through ignored symlinks.
- The broad `uploads` ignore rule was narrowed so `backend/src/modules/uploads` is now versioned source while runtime/customer upload directories remain ignored. This closes the clean-clone composition defect without exposing uploaded data.

### Pre-existing dirty files to preserve

```text
M caffe/frontend/src/pages/cafe/pos.tsx
M caffe/frontend/src/pages/cafe/products.tsx
M frontend/src/lib/product-image.ts
M frontend/src/pages/cafe/pos.tsx
M frontend/src/pages/cafe/products.tsx
M frontend/src/pages/sales/new-receipt-layout.spec.ts
M frontend/src/pages/sales/new-receipt.tsx
?? apply-one80-product-image-map.mjs
?? caffe/frontend/src/lib/product-image-input.ts
?? caffe/frontend/src/lib/product-image.test.ts
?? deploy-one80-cafe-frontend-20260909.sh
?? deploy-one80-cafe-images-20260909.sh
?? frontend/src/lib/product-image-input.ts
?? frontend/src/lib/product-image.test.ts
?? hr-reference/.gitignore
?? materialize-one80-product-images.mjs
?? one80-cafe-image-url-hotfix.js
?? one80-pos-products.tsv
?? one80-product-image-map.tsv
?? patch-one80-cafe-image-ui.mjs
```

The sync must not stage or rewrite those paths. Printing integration must avoid `frontend/src/pages/sales/new-receipt.tsx` unless a later verified requirement cannot be met elsewhere.

## Baseline Semantic Inventory

This table records the pre-implementation comparison that drove the five batches; completion evidence is in the ledger and final audit below.

| Area | Already in ONE80 | Gap established at baseline | Source mapping |
|---|---|---|---|
| Sales portal routing | `/sales-portal`, `/sales-portal/leads`, `/sales-portal/results`; POS remains `/sales/new`; RBAC workspace redirects are covered | Reminders and renewals workspace sections; richer profile navigation | Fitness Time `frontend/src/pages/sales/*`, adapted to ONE80 route family |
| CRM lead model | Additive `club_sales_crm_leads`, follow-ups, import/export, branch scope, activity types, quick-sale capture | Call reminders, reminder completion, renewal lead creation, renewal candidates/conversion/handoff, subscription context, freshness rules | Fitness Time `club-leads.*`, rewritten against `club_sales_crm_*` rather than copied |
| Actual sales outcomes | Target-cycle math, sales settings, subscriptions carry `sales_id`, sales portal summary exists | Canonical paid-subscription context and renewal results in lead/profile payloads | Fitness Time `lead-subscription-context.*`, `club-members.sales-renewals.spec.ts` |
| Sales-team management | Per-rep targets and tiers; trainer targets; management routes and boards | Global defaults/opt-in, tier labels, active flag, deactivation transfer, creation boundary, rep multi-branch scope | Fitness Time September migrations and `sales-defaults.*`, `lead-transfer-plan.*`, `auth.sales-branches.spec.ts` |
| Trainer portal | Standalone portal, calendar/month range, attendance, class earnings, private commission items, payments, management workspace | Active private clients/check-ins, configured private commission mode/rate, refund clawback, payroll-safe payout integration | Fitness Time `trainer-earnings.*`, `trainer-receipt-commissions.ts`, `trainer-subscription-refunds.ts`, trainer portal additions |
| Trainer ratings | Generic trainer/member rating table and admin UI | Attendance-bound one-rating-per-private-checkout flow; transactional aggregate integrity | Fitness Time checkout-rating migration/tests. PHAROS member rating UI is supplementary, not a substitute for attendance binding |
| Receipt printing | Subscription invoice print, generic print view, POS receipt helpers | Central gym policy, thermal/A4 choice, Arabic/English, copy count, auto-print per paid flow, safe reprint | Fitness Time `club-printing.*`, thermal receipt components, printing-policy migrations/tests |
| Expense printing/approval | Expense CRUD and form tests | Approval policy and printable expense document aligned with central print rules | Fitness Time `expenses.approval-policy.spec.ts` plus ONE80 finance conventions |
| PHAROS package offers | Not present | Promo enablement, price/discount, image, end date, marketing message in API/admin/member app | PHAROS package-promo migrations, app-management service and UI |
| Member-app payment methods | No `am_payment_methods` model | Branch/global member-app payment catalog and app exposure | PHAROS `20260903120000_app_payment_methods` and app-management/member service |
| Class audience | `ClubClassAudience` and audience on classes already exist | Verify member API and schedule defaults enforce/expose audience consistently | PHAROS audience service/tests; avoid duplicating existing ONE80 schema |
| Trainer availability | Only ignored legacy generic availability table | First-class weekly `club_trainer_availability`, CRUD, member-app exposure | PHAROS trainer availability schema/service/tests/UI |
| Branch isolation | Strong shared scope and several module tests; member identity is branch-unique | Close uncovered member app, audit, CRM transfer, multi-branch sales gaps | PHAROS branch-scope specs plus Fitness Time sales-branch specs |

## Additive Migrations

Each migration was established from a failing contract test and uses additive columns/tables, nullable foreign keys, safe defaults, and indexes only.

1. `20260909100000_one80_sales_crm_completion`: nullable call-reminder timestamps and indexes on the ONE80 CRM lead/follow-up tables only; no changes to legacy `club_leads`.
2. `20260909110000_one80_sales_team_defaults_branches`: opt-in global defaults, rep activation, tier labels, and normalized multi-branch assignments. Existing per-rep settings opt out by default so their configured financial values are preserved.
3. `20260909120000_one80_trainer_commission_integrity`: explicit trainer commission/private-rate modes, refund timestamps and clawback amounts, immutable receipt/refund commission evidence, and attendance-bound rating/reference fields.
4. `20260909130000_one80_central_printing`: central printing policy, paper size, language, copies, and expense approval flag with conservative defaults.
5. `20260909140000_one80_member_app_extras`: package promo fields, member-app payment methods, and trainer availability.

## Verification Ledger

### Baseline

- Frontend sales/trainer/team view-models: **17 passed, 0 failed**.
- Backend sales portal, trainer portal, renewal, and CRM scope: three suites initially passed with **16 tests**; CRM scope could not compile because the ignored uploads module was absent from the worktree.
- After adding the ignored local source symlink, CRM scope: **13 passed, 0 failed**. The four selected backend suites therefore have **29 passing tests** in the reconstructed baseline environment.

### Batch ledger

| Batch | RED evidence | GREEN evidence | Build/schema | Commit | Status |
|---|---|---|---|---|---|
| 1. CRM portal, reminders, renewals, subscription context | Four new backend suites failed on missing subscription-context module and missing reminder/renewal methods; two frontend suites failed on missing direct tabs/routes, navigation helper, and renewal ordering | Backend: **25/25** across six CRM/portal/renewal suites. Frontend: **12/12** workspace/navigation tests | Prisma schema valid with a non-production placeholder URL; backend typecheck/build passed; frontend modal-runtime tests and production build passed | `feat: complete one80 sales CRM workspace` | Verified |
| 2. Sales-team defaults, activation, transfer, multi-branch | Missing pure modules caused three compile failures; explicit branch-scope, inactive/branch assignment, activation preview/transfer, and two frontend intent tests then failed on absent behavior | Backend sales/auth/branch/member scope: **58/58** across 20 suites. Frontend sales team/portal models: **19/19** | Prisma generate/validate passed; backend and frontend typechecks passed; backend and frontend production builds passed | `feat: add one80 sales team controls` | Verified |
| 3. Trainer private clients, commission/refund/payroll/rating | Fixed-rate fallback, refund distribution, canonical earning modes/overpayment, receipt snapshots, checkout rating, private-client queries/check-in, and frontend sorting/check-in tests failed first on missing modules and behavior; a repeated-refund regression then exposed under-clawback from using the remaining rather than original commission | Backend: **28/28** across ten trainer/private/refund suites. Frontend trainer model: **5/5** | Additive schema validates and Prisma client generates; backend/frontend typechecks and production builds pass | `feat: harden one80 trainer private earnings` | Verified |
| 4. Central receipts and expense printing | Printing decision/template tests first failed on missing modules; expense policy tests then failed because new expenses remained pending and never posted atomically | Frontend: **14/14** new printing/template/popup/policy/paid-flow tests and **84/84** full suite. Backend focused policy/expense: **11/11**; after materializing the ignored uploads source, full backend: **907/907** | Additive schema validates and Prisma client generates; backend/frontend typechecks and production builds pass; ONE80 branding, Arabic RTL/English LTR, thermal/A4 and one/two-copy output are covered | `2fd0c5a` printing; `64c91bb` clean-clone uploads packaging | Verified |
| 5. PHAROS member-app/package/class/trainer/branch additions | Backend contracts first failed on missing promo, payment-method, and trainer-availability methods and member payloads; frontend contracts failed on absent package promo controls, payment-method route, and the operational trainer availability editor. The final routing test also failed while `/app/trainers` still targeted the unused app-only trainer resource | Full backend: **917/917** across 216 suites. Full frontend: **87/87**. Package promo, member payment feed/admin branch isolation, weekly availability validation and member exposure, upload policy, and operational trainer routing are covered | Prisma validate/generate pass with a local placeholder URL; backend/frontend typechecks and production builds pass. Desktop and 390×844 QA covered payment methods, package promo, and trainer availability; Impeccable detector returned `[]` | `5abef81` | Verified |
| 6. September 8 scanner/reception/personal-sales parity | Scanner model, HID wedge, numeric priority, scanner identity, reception handoff, contact-link, and cross-page client navigation contracts all failed before their implementations existed or accepted the new cases | Full backend: **922/922** across 218 suites. Full frontend: **99/99**. Exact/prefix numeric priority, Arabic/Persian digits, leading-zero credentials, one-shot `?scan=` consumption, contact links, and paginated navigation are covered | Backend/frontend typechecks and production builds pass; Prisma validates and generates with a non-production placeholder URL; modal-runtime checks pass; final Impeccable scan across eight affected UI files returned `[]` | `b772a16`, `e22970d`, `1df3f75`, `f66bc1e` | Verified |

## Final Audit

- CRM additions use only the `club_sales_crm_*` contract; the ignored legacy `club_leads` table was not migrated or rewritten.
- `/sales` remains POS and `/sales-portal` remains personal sales. No source route family or product identity was imported.
- ONE80 member, HR, POS, Cafe, Accounting, inventory, and project-specific behavior remain the base; the sync consists of targeted integrations and additive migrations rather than whole-file replacement.
- Class audience and attendance-bound trainer rating integrity already existed after the earlier batches, so batch 5 reused and exposed those contracts instead of adding duplicate schema or a second rating workflow.
- Member-app payment administration enforces global/system-admin versus branch-scoped writes, while the public member feed resolves branch-specific entries before global fallbacks.
- Runtime/customer upload directories remain ignored; only the required Nest upload source is versioned through the narrow exception recorded in `64c91bb`.
- No production database, deployment, reset, reseed, or destructive migration command was run. The final migration scan found no `DROP`, `TRUNCATE`, `DELETE FROM`, or rename statement.
- All pre-existing Cafe/POS/product-image changes and local operational scripts listed above remain uncommitted and unstaged.
- ONE80's payroll engine intentionally consumes gym incentives through its existing adapter, while trainer disbursements remain in the auditable `club_trainer_earning_payments` workflow. This batch prevents overlapping payout periods and snapshots receipt/refund attribution; it does not replace ONE80 payroll tables with Fitness Time's separate payroll schema.
- The September 8 source snapshot was re-audited outside its domain folders. ONE80 now owns the persistent camera/HID scanner, header toggle, reception handoff, numeric member-code priority, editable `gate_credentials` identity, and the latest personal-sales search/filter/pagination/live-refresh/profile/contact behaviors.
- Fitness Time's `/sales` page and legacy `club_leads` storage were deliberately not copied. The behavior was adapted to ONE80's `/sales-portal` routes and `club_sales_crm_*` tables; ONE80 `/sales` remains POS.
- Adjacent source workflows that would replace ONE80 payment/subscription ownership were not imported. Existing ONE80 invitation, transfer, renewal, reception, and printing contracts remain authoritative.
