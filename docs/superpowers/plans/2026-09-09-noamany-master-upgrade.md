# Noamany Master Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or the explicitly approved parallel-agent workflow to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Noamany with the latest proven gym behavior from FITNESS TIME, the latest complete café behavior from ONE80, and every remaining client request, with concise Arabic navigation and review screenshots.

**Architecture:** Noamany remains the target and source of identity/data. Source leaf modules are reconciled in isolated ownership lanes; only the master agent integrates shared Prisma, router, RBAC, shell, finance and localization files. Each feature is reviewed by a separate `gpt-5.6-sol` XHigh agent before browser screenshots and acceptance-ledger completion.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, React 18, TypeScript, Vite, Tailwind/Radix, Node test runner/Jest, browser QA at 1440×900 and 390×844.

**Spec:** `docs/superpowers/specs/2026-09-09-noamany-master-upgrade-design.md`

## Global Constraints

- Target: `/Users/fatmaatefkasem/Documents/noamany-engineer26-8`.
- FITNESS TIME supplies gym deltas only; ONE80 supplies café deltas only; the correct legacy app supplies client terminology and workflow intent.
- Preserve Noamany identity, operational data, HR customizations, finance history, upload paths, and role assignments.
- Never copy `.env`, credentials, databases, uploads, operational TSVs, source deployment scripts, or source brand assets.
- Existing Noamany café POS keeps `/sales/*`; the personal sales workspace uses `/sales-portal`.
- Tests precede production behavior changes. Every new user-facing requirement receives desktop/mobile screenshot evidence.
- Shared schema/router/RBAC/shell/localization integration is master-owned unless a task explicitly assigns it.

---

### Task 1: Baseline, route ownership, and acceptance ledger

**Files:**
- Create: `review/client-requirements-2026-09-09/INDEX.md`
- Create: `review/client-requirements-2026-09-09/README.md`
- Create: `frontend/src/lib/route-ownership.test.mjs`
- Modify: none of the runtime route files in this task

**Interfaces:**
- Produces: a 40-row acceptance ledger and an executable route-ownership test proving `/sales/*` belongs to café POS and `/sales-portal` belongs to the personal sales workspace.

- [ ] Write the failing route-ownership test against the current router contract.
- [ ] Run it and confirm `/sales-portal` is missing while POS ownership remains visible.
- [ ] Create the evidence index from `docs/audits/master-port/client-requirements-matrix.md` with stable IDs and screenshot paths.
- [ ] Record baseline commands and current results without marking incomplete features complete.

### Task 2: ONE80 café schema and backend reconciliation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260909*_noamany_cafe_parity/migration.sql`
- Modify/Add: `backend/src/modules/cafe/**`
- Add: `backend/src/modules/cafe-dashboard/**`
- Add: `backend/src/modules/cafe-waste/**`
- Modify/Add: `backend/src/modules/inventory/**`
- Modify/Add: `backend/src/modules/procurement/**`
- Modify/Add: `backend/src/modules/sales/**`
- Add/Modify: focused finance/accounting helpers required by café posting
- Do not modify: frontend, router, sidebar, global RBAC integration

**Interfaces:**
- Produces: current ONE80 café APIs against Noamany identities and tables, additive migration, and passing focused backend tests.
- Consumes: Noamany auth, `BranchScopeService`, Prisma, accounting module ledger, finance approvals and employees.

- [ ] Port focused ONE80 tests for product images/recipes, packaged materials, stock-taking, waste, customers, mixed payments, employee benefits, completed-sale edit/refund, shift close/handover and finance projection.
- [ ] Run focused tests and confirm expected failures against the current target.
- [ ] Diff actual Prisma models and write a forward-only, no-data migration for only missing columns/tables/indexes/relations.
- [ ] Reconcile café catalog, dashboard, waste, inventory and procurement services/controllers.
- [ ] Reconcile quick sale, payment snapshot, employee benefit, shift close and handover contracts.
- [ ] Adapt finance/accounting projections to Noamany source identities; prevent duplicate posting.
- [ ] Run Prisma validation/generation, focused tests, backend typecheck and build.

### Task 3: ONE80 café frontend reconciliation

**Files:**
- Modify/Add: `frontend/src/pages/cafe/**`
- Add: `frontend/src/pages/cafe-dashboard/**`
- Modify/Add: `frontend/src/pages/inventory/**`
- Modify/Add: `frontend/src/pages/procurement/**`
- Modify/Add: `frontend/src/pages/sales/**` for café POS only
- Modify/Add: `frontend/src/components/cafe/**`
- Modify/Add: `frontend/src/components/sales/**`
- Modify/Add: `frontend/src/components/inventory/**`
- Modify/Add: café/POS hooks, types and library helpers
- Do not modify: `frontend/src/app/router.tsx`, `lazy-pages.ts`, sidebar, global locale catalogs

**Interfaces:**
- Produces: source-equivalent ONE80 café screens using Noamany components/identity and existing POS routes.
- Consumes: current/Task-2 API contracts; master integrates routes and permissions afterward.

- [ ] Port source behavior tests for product image validation, POS layout/cart, payment allocation, receipt/shift close, employee benefits and stock-taking models.
- [ ] Run tests and confirm they fail for missing current behavior.
- [ ] Merge current ONE80 working-tree image URL validation, fallback, debounce and larger POS imagery.
- [ ] Merge the latest product, recipe, POS, order review, payment, invoice, shift and printing components.
- [ ] Merge customer, café dashboard, waste, stock-taking workspace, inventory and procurement interfaces.
- [ ] Preserve Noamany Arabic copy/brand; remove ONE80 literals and deployment assumptions.
- [ ] Run focused tests, frontend typecheck and production build.

### Task 4: Café shared integration and first review package

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/rbac/**`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: navigation, route helpers, locales, printing brand helper and shared package files as required
- Create: `review/client-requirements-2026-09-09/CAFE-*/README.md`

**Interfaces:**
- Produces: reachable, permissioned café parity build and the first reviewer package.

- [ ] Add failing integration tests for café modules, route visibility, permission mapping and source-brand absence.
- [ ] Register café dashboard/waste and merged routes without changing personal portal namespace decisions.
- [ ] Merge RBAC additively and preserve existing custom roles.
- [ ] Run the complete backend suite, frontend tests, typechecks, Prisma validation and builds.
- [ ] Dispatch `gpt-5.6-sol` XHigh review for spec compliance and code quality.
- [ ] Fix Critical/Important findings and repeat focused verification.
- [ ] Run desktop/mobile browser QA and save café screenshots/README evidence.

### Task 5: FITNESS TIME CRM, personal sales portal, and persistent scanner

**Files:**
- Add/Merge: `backend/src/modules/club-sales/**`
- Merge: relevant `club-members`, subscription ownership and branch-scope files
- Add: `frontend/src/pages/sales-portal/**`
- Add/Merge: sales management pages/components/models
- Add/Merge: persistent scanner, hardware scanner and camera overlay files
- Modify: shared Prisma/RBAC/router/shell/locales under master ownership

**Interfaces:**
- Produces: `/sales-portal`, `/club/leads`, consolidated `/club/sales-reports`, and app-wide scanner without POS collisions.

- [ ] Port route collision, CRM, pagination, reminder, renewal, transfer, target/default and scanner tests first.
- [ ] Rehearse required additive CRM migrations against the target schema.
- [ ] Port backend CRM/commission/renewal context.
- [ ] Port the sales portal to `/sales-portal` and adapt all redirects/home-route decisions.
- [ ] Wrap AppShell in one persistent scanner provider using Noamany storage keys.
- [ ] Add preview-only sales role and server-side mutation restrictions.
- [ ] Run full verification and dispatch `gpt-5.6-sol` XHigh review.
- [ ] Save desktop/mobile screenshots for CRM, portal and scanner requirements.

### Task 6: FITNESS TIME trainer, subscription, printing and payroll deltas

**Files:**
- Merge: `backend/src/modules/club-fitness/**`
- Merge: `backend/src/modules/club-subscriptions/**`
- Add/Merge: commission/refund/service-debt/printing/cashier/expense-policy units
- Merge: trainer portal/management, subscription and finance UI families
- Modify: additive schema/RBAC/routes under master ownership

**Interfaces:**
- Produces: latest trainer workspace, target periods, ratings, branch prices, renewal lineage, actual paid context and commission integrity without replacing Noamany HR payroll.

- [ ] Port focused source tests and establish expected failures.
- [ ] Reconcile schema migrations object-by-object.
- [ ] Merge trainer portal/earnings/rating/commission/refund behavior.
- [ ] Merge subscription renewal, branch-price, plan conversion, printing and cashier visibility behavior.
- [ ] Adapt payroll/commission postings through Noamany's existing payroll lifecycle.
- [ ] Run full verification and dispatch `gpt-5.6-sol` XHigh review.
- [ ] Save desktop/mobile screenshots for trainer/subscription requirements.

### Task 7: Café classification and unified target report

**Files:**
- Add: transaction classification migration/model/service
- Add/Merge: `/club/targets` backend/frontend report units
- Merge: café reports and payroll target consumers

**Interfaces:**
- Produces: explicit `protein`, `bar`, and `management_withdrawal` facts and one four-tab target report.

- [ ] Write reconciliation tests proving Protein only affects Protein target while Bar and management withdrawals do not.
- [ ] Add explicit server-owned classification; never infer from product names.
- [ ] Implement subscriptions/private/sales/sessions tabs with client name/code/phone drill-downs.
- [ ] Apply branch/month/person and applicable men/women filters consistently.
- [ ] Review with `gpt-5.6-sol` XHigh and save report screenshots.

### Task 8: Evaluations, customer service, and locker inventory

**Files:**
- Merge/Extend: `backend/src/modules/evaluations/**`
- Add: customer-service module/pages
- Extend: locker inventory services/pages/schema
- Merge: HR mobile self-evaluation and permission-detail endpoints

**Interfaces:**
- Produces: legacy-equivalent administrations using consolidated modern workspaces.

- [ ] Write tests for role templates, monthly uniqueness, self-scope, question versioning, opinion filters, locker draft/finalize/review and authorization.
- [ ] Implement evaluation criteria for trainers/reception/branch managers plus reports and “تقييماتي”.
- [ ] Implement customer follow-up/questions/opinions in one workspace.
- [ ] Implement locker inventory/review tabs separately from café inventory.
- [ ] Complete modern permission-request detail/action contracts.
- [ ] Review with `gpt-5.6-sol` XHigh and save desktop/mobile evidence.

### Task 9: Access scope, reports, points and discount administration

**Files:**
- Extend: branch/audience scope, report DTOs/services/components
- Merge: monthly analysis/daily close/report tabs
- Complete: points and discount-code administration
- Disable: obsolete member groups/surveys routes/navigation while retaining data

**Interfaces:**
- Produces: branch plus men/women authorization, client terminology, and discoverable existing functions without redundant pages.

- [ ] Add cross-branch/cross-section list/count/export leakage tests.
- [ ] Implement audience scope as authorization, not frontend filters.
- [ ] Add monthly analysis and controlled daily-close semantics to existing reports.
- [ ] Finish points history/adjustment and discount-code screens using legacy labels.
- [ ] Hide obsolete groups/surveys and preserve history.
- [ ] Review with `gpt-5.6-sol` XHigh and save evidence.

### Task 10: Online subscriptions, member APIs and website completion

**Files:**
- Add/Merge: public payment methods, online subscription staging/proof/promotion
- Add: member branch-trainer and calorie/macro contracts
- Modify: `website-redesign/**`
- Modify: portal-management CMS coverage

**Interfaces:**
- Produces: public “اشترك الآن” flow, proof-backed admin approval, app APIs and fully responsive website.

- [ ] Write tests for package identity, active payment methods, proof validation, idempotent promotion, branch trainer scope and nutrition formulas.
- [ ] Implement public detail/checkout and admin online-subscription queue.
- [ ] Implement proof upload and transactional promotion into normal subscriptions.
- [ ] Implement member trainer and nutrition APIs.
- [ ] Remove ticker, complete CMS coverage, use “اشترك الآن”, and polish mobile store/cart.
- [ ] Review with `gpt-5.6-sol` XHigh and save desktop/mobile evidence.

### Task 11: Final verification, visual audit, and acceptance handoff

**Files:**
- Complete: `review/client-requirements-2026-09-09/INDEX.md`
- Add: final run logs/checklists under the same review tree

- [ ] Re-run every backend/frontend/website test and production build with fresh output.
- [ ] Validate/generate Prisma and rehearse migrations on an isolated Noamany-compatible database.
- [ ] Test representative roles, branches and men/women scopes.
- [ ] Run Impeccable detector on changed UI and complete one bounded desktop/mobile visual pass.
- [ ] Dispatch final whole-system `gpt-5.6-sol` XHigh review.
- [ ] Resolve all Critical/Important findings.
- [ ] Confirm all 40 acceptance rows link to routes, tests and screenshots; report real-device limitations honestly.
