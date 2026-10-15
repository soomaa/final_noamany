# ONE80 PHAROS App Management Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the complete PHAROS app-management module into ONE80 while retaining ONE80 branding, branch scope, payment-method safeguards, and production data.

**Architecture:** Reconcile PHAROS frontend flows into ONE80 screen by screen, using PHAROS API paths without creating a parallel contract. Keep ONE80 backend and payment-method code when it is already newer, add only missing behavior, and validate the full module through focused parity tests before producing a data-free release.

**Tech Stack:** React 18, TypeScript, TanStack Query/Table, React Hook Form, Zod, NestJS, Prisma 5, MySQL, Node test runner, Jest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-10-one80-pharos-app-management-parity-design.md`

## Global Constraints

- Copy code and API behavior only; never copy PHAROS database rows, uploads, secrets, `.env`, logos, names, or production URLs.
- Preserve ONE80 branding and all existing ONE80 branch-scoped payment-method behavior.
- Use the PHAROS route and request contracts so the ONE80 mobile app can consume the same APIs.
- Do not weaken an existing backend permission or branch check to make a copied frontend work.
- Do not recreate, truncate, seed over, or replace production business tables.
- Use `apply_patch` for source edits and preserve unrelated dirty-worktree changes.

---

### Task 1: Register the complete app-management surface

**Files:**
- Modify: `frontend/src/lib/app-management-routes.ts`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/app-management/index.tsx`
- Modify: `backend/src/modules/rbac/catalog/rbac.catalog.ts`
- Test: `frontend/src/lib/app-management-navigation.spec.ts`

**Interfaces:**
- Consumes: existing `APP_MANAGEMENT_ROUTES`, lazy-page registry, `NAV_SECTIONS`, and RBAC catalog.
- Produces: `APP_MANAGEMENT_ROUTES.notifications`, `MemberNotificationsPage`, `/app/notifications`, and a navigable `app-management.notifications` resource.

- [ ] **Step 1: Write the failing route and navigation test**

Add a behavior test that imports the route constants and `NAV_SECTIONS`, then resolves the app-management destinations exactly as the sidebar does:

```ts
test('member notifications are a reachable app-management destination', () => {
  assert.equal(APP_MANAGEMENT_ROUTES.notifications, '/app/notifications');
  const section = NAV_SECTIONS.find((item) => item.id === 'app-management');
  const destinations = [...(section?.items ?? []), ...(section?.groups ?? []).flatMap((group) => group.items)].map((item) => item.to);
  assert.equal(destinations.includes('/app/notifications'), true);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && npx tsx --test src/lib/app-management-navigation.spec.ts`

Expected: FAIL because the notification route, lazy export, or navigation item is missing.

- [ ] **Step 3: Add the route, export, navigation, and RBAC path**

Add `notifications: '/app/notifications'`, lazy-load `AppMemberNotificationsPage` as `MemberNotificationsPage`, register the router destination, add `AM.notifications` to the content group, and change the existing non-navigable RBAC notification node into:

```ts
page('app-management.notifications', 'إشعارات الأعضاء', '/app/notifications', LIST, 'Member notifications')
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd frontend && npx tsx --test src/lib/app-management-navigation.spec.ts`

Expected: all tests in the file PASS.

### Task 2: Add the PHAROS member-notifications screen

**Files:**
- Create: `frontend/src/pages/app-management/member-notifications.tsx`
- Create: `frontend/src/lib/member-notification-compose.ts`
- Modify: `frontend/src/pages/app-management/index.tsx`
- Test: `frontend/src/lib/member-notification-compose.spec.ts`
- Verify: `backend/src/modules/app-management/app-management.member-notifications.spec.ts`

**Interfaces:**
- Consumes: `GET /app/notifications`, `POST /app/notifications`, branch options, `app-management.notifications:*`, and the existing `am_member_notifications` model.
- Produces: `AppMemberNotificationsPage` with all-members/branch targeting and `appUsersOnly` behavior.

- [ ] **Step 1: Write the failing notification-flow test**

Test the real request builder used by the page with hand-derived payloads:

```ts
assert.deepEqual(buildMemberNotificationRequest({ title: ' عرض ', body: ' تجديد ', target: 'branch', branchId: '3', appUsersOnly: true }), {
  title: 'عرض', body: 'تجديد', type: 'offer', broadcast: true, appUsersOnly: true, branchId: 3,
});
assert.throws(() => buildMemberNotificationRequest({ title: '', body: 'x', target: 'all', branchId: '', appUsersOnly: true }));
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd frontend && npx tsx --test src/lib/member-notification-compose.spec.ts`

Expected: FAIL because `buildMemberNotificationRequest` does not exist.

- [ ] **Step 3: Port and adapt the PHAROS screen**

Port the PHAROS notification composer and history list. Keep the request payload exactly:

```ts
{
  ...buildMemberNotificationRequest({ title, body, target, branchId, appUsersOnly }),
}
```

Use ONE80 shared controls and translation helpers, explicit labels for the switch, a confirmation before fan-out, pending state on submit, and query invalidation after success.

- [ ] **Step 4: Run frontend and backend notification tests**

Run:

```bash
cd frontend && npx tsx --test src/lib/member-notification-compose.spec.ts
cd ../backend && npx jest src/modules/app-management/app-management.member-notifications.spec.ts --runInBand
```

Expected: both commands PASS and backend targeting remains restricted to active, non-deleted members.

### Task 3: Port PHAROS offers and trainer administration

**Files:**
- Modify: `frontend/src/pages/app-management/content-pages.tsx`
- Modify: `frontend/src/pages/app-management/app-shell.tsx`
- Modify: `frontend/src/pages/app-management/app-crud.tsx`
- Create: `frontend/src/lib/app-promotion-model.ts`
- Create: `frontend/src/lib/app-upload-route.ts`
- Test: `frontend/src/lib/app-promotion-model.spec.ts`
- Test: `frontend/src/lib/app-upload-route.spec.ts`
- Test: `frontend/src/pages/app-management/member-app-extras.spec.ts`

**Interfaces:**
- Consumes: `/club-subscription-types`, `PUT /club-subscription-types/:id/promo`, `/club-trainers/:id/availability`, trainer ratings, upload categories, and precise permission resources.
- Produces: package-backed promotion management and full trainer app profiles with specialties, availability, ratings, media, and visibility.

- [ ] **Step 1: Replace the outdated assertions with failing parity assertions**

Test the real promotion model with live, expired, legacy-derived discount, and invalid-duration fixtures. Keep the existing trainer availability behavior test because it exercises the operational editor contract; compilation and the production build cover component integration.

```ts
assert.deepEqual(toPromoSummary({ price: 1000, promoPrice: 750, promoEnabled: true, promoEndsAt: '2026-09-12T00:00:00Z' }, Date.parse('2026-09-10T00:00:00Z')), {
  isLive: true, daysRemaining: 2, discountPercent: 25,
});
assert.throws(() => buildPromoUpdate({ price: '750', discountPercent: '25', durationDays: '0', image: null }));
```

Test `appUploadRoute('trainers') === '/uploads/trainers'` and `appUploadRoute()` returns `/uploads/app`; use this helper inside `uploadAppImage(file, category)`. The production build verifies the `AppCrudPage` permission-resource integration.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && npx tsx --test src/lib/app-promotion-model.spec.ts src/lib/app-upload-route.spec.ts src/pages/app-management/member-app-extras.spec.ts`

Expected: FAIL on package promo and full trainer editor assertions.

- [ ] **Step 3: Port package-backed promotion management**

Bring PHAROS `PromoRow`, `PromoDraft`, expiry calculation, create/edit/end actions, package preview, and `club-package-promo` image upload into ONE80. Do not use standalone `/app/offers` from this screen because the member API reads package `promo_*` fields.

- [ ] **Step 4: Port the trainer app editor**

Bring PHAROS `TrainerAdminRow`, Zod schemas, specialization chips, availability field array, photo upload, ratings panel, dual permission-family checks, and save sequence. Preserve the exact operational API ownership:

```ts
await api.put(`/club-trainers/${trainerId}`, trainerPayload);
await api.put(`/club-trainers/${trainerId}/availability`, { slots });
```

- [ ] **Step 5: Harden shared app-management helpers**

Update `uploadAppImage` to accept an upload category and make `AppCrudPage` pass `permissionResource` to its create and save controls so frontend gates match backend guards.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `cd frontend && npx tsx --test src/lib/app-promotion-model.spec.ts src/lib/app-upload-route.spec.ts src/pages/app-management/member-app-extras.spec.ts`

Expected: all parity assertions PASS.

### Task 4: Port enriched exercise, news, and advertisement forms

**Files:**
- Modify: `frontend/src/pages/app-management/content-pages.tsx`
- Create: `frontend/src/lib/app-content-payloads.ts`
- Test: `frontend/src/lib/app-content-payloads.spec.ts`

**Interfaces:**
- Consumes: `/app/exercise-categories`, `/app/exercises`, `/app/news`, `/app/ads`, and category-specific image upload.
- Produces: complete PHAROS CRUD fields, media controls, active/published switches, relationship selectors, and validation-ready payloads.

- [ ] **Step 1: Write failing field-coverage tests**

Test the real payload builders consumed by the four forms, including optional-field omission and numeric conversion:

```ts
assert.deepEqual(buildExercisePayload({ name: 'Squat', categoryId: '4', duration: '30', difficulty: 'medium', description: '', instructions: '', imageUrl: '', isActive: true }), {
  name: 'Squat', categoryId: 4, duration: 30, difficulty: 'medium', isActive: true,
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd frontend && npx tsx --test src/lib/app-content-payloads.spec.ts`

Expected: FAIL on at least one PHAROS-specific form or upload pattern.

- [ ] **Step 3: Port PHAROS forms while preserving ONE80 components**

Move the PHAROS category, exercise, news, and ad definitions into ONE80. Keep their API resource strings unchanged, use shared `Select`, `Switch`, `UploadField`, `FieldWrapper`, and `AppCrudPage`, and retain Arabic RTL/English translation behavior.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd frontend && npx tsx --test src/lib/app-content-payloads.spec.ts`

Expected: all field-coverage tests PASS.

### Task 5: Reconcile payment methods and backend API parity

**Files:**
- Modify when required: `frontend/src/pages/app-management/payment-methods.tsx`
- Modify when required: `backend/src/modules/app-management/app-management.controller.ts`
- Modify when required: `backend/src/modules/app-management/app-management.service.ts`
- Modify when required: `backend/src/modules/app-management/dto/app-management.dto.ts`
- Modify when required: `backend/prisma/schema.prisma`
- Create only if schema is absent: `backend/prisma/migrations/20260910xxxxxx_one80_app_management_pharos_parity/migration.sql`
- Test: `backend/src/modules/app-management/app-payment-methods.spec.ts`
- Test: `backend/src/modules/app-management/app-management.member-notifications.spec.ts`
- Test: `backend/src/modules/app-management/app-management.invitation-integrity.spec.ts`

**Interfaces:**
- Consumes: PHAROS controller/service/DTO contracts and ONE80's `JwtUser` branch scope.
- Produces: API parity without regressing ONE80 branch isolation or payment-method management.

- [ ] **Step 1: Run current backend app-management tests as a baseline**

Run:

```bash
cd backend && npx jest \
  src/modules/app-management/app-payment-methods.spec.ts \
  src/modules/app-management/app-management.member-notifications.spec.ts \
  src/modules/app-management/app-management.invitation-integrity.spec.ts \
  --runInBand
```

Expected: record the existing result before reconciliation.

- [ ] **Step 2: Compare public API signatures and schema objects**

Verify every PHAROS app-management `GET`, `POST`, `PUT/PATCH`, and `DELETE` route exists in ONE80 with the same DTO fields and response shape. Verify `am_member_notifications` and payment-method models already exist in `schema.prisma` and an applied migration path.

- [ ] **Step 3: Add only demonstrated missing backend behavior**

If a ported frontend request lacks support, first add a failing Jest test for the exact request, then implement the smallest controller/service/DTO change. Keep ONE80 methods that accept `JwtUser` and apply branch scope. Do not create a migration when the current schema and `20260909140000_one80_member_app_extras` already provide the required tables.

- [ ] **Step 4: Verify backend app-management tests**

Run the three-test Jest command from Step 1.

Expected: all suites PASS.

### Task 6: Final UI, branding, build, and release verification

**Files:**
- Review: `frontend/src/pages/app-management/*.tsx`
- Review: `frontend/src/lib/nav.ts`
- Review: `frontend/src/app/router.tsx`
- Review: `backend/src/modules/app-management/**`
- Output: `one80-complete-pharos-app-management-parity-20260910.zip`

**Interfaces:**
- Consumes: all prior tasks and the existing data-free release builder.
- Produces: one verified deployment archive containing app-management parity and all previous ONE80 fixes.

- [ ] **Step 1: Run branding and data-safety scans**

Run:

```bash
rg -n -i "pharos|swatgym" frontend/src/pages/app-management backend/src/modules/app-management
git diff --check
```

Expected: no user-facing PHAROS/SwatGym branding and no whitespace errors.

- [ ] **Step 2: Run Impeccable detector on the complete UI surface**

Run:

```bash
node /Users/fatmaatefkasem/.agents/skills/impeccable/scripts/detect.mjs --json \
  frontend/src/pages/app-management/about.tsx \
  frontend/src/pages/app-management/app-crud.tsx \
  frontend/src/pages/app-management/app-shell.tsx \
  frontend/src/pages/app-management/content-pages.tsx \
  frontend/src/pages/app-management/invitations.tsx \
  frontend/src/pages/app-management/member-notifications.tsx \
  frontend/src/pages/app-management/payment-methods.tsx
```

Expected: no material findings.

- [ ] **Step 3: Run full frontend verification**

Run: `cd frontend && npm test && npm run build`

Expected: zero test failures, TypeScript success, and Vite production build success.

- [ ] **Step 4: Run Prisma and targeted backend verification**

Run:

```bash
cd backend && npx prisma validate && npx prisma generate
npx jest src/modules/app-management --runInBand
```

Expected: schema validation and generation succeed; all app-management tests PASS.

- [ ] **Step 5: Build and validate the data-free release**

Run from the repository root:

```bash
bash make-release.sh
cp one80-deploy.zip one80-complete-pharos-app-management-parity-20260910.zip
unzip -t one80-complete-pharos-app-management-parity-20260910.zip
node code-only-release-gate.mjs one80-complete-pharos-app-management-parity-20260910.zip
shasum -a 256 one80-complete-pharos-app-management-parity-20260910.zip
```

Expected: archive integrity and code-only gate PASS and a SHA-256 is printed for handoff.
