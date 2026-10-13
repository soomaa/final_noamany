# Club Points and Discount Codes Full Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the legacy-equivalent, twelve-page Club Points and Discount Codes administration in two sidebar groups.

**Architecture:** Keep legacy-compatible database tables and centralized Nest services as the source of business rules. Add focused report/search endpoints, then replace the combined frontend page with route-specific pages sharing small feature components and query hooks.

**Tech Stack:** NestJS, Prisma/MySQL, React, TypeScript, TanStack Query, React Router, existing frontend i18n.

**Spec:** `docs/superpowers/specs/2026-09-22-club-points-and-discount-codes-full-migration-design.md`

## Global Constraints

- Preserve the eight legacy-compatible tables; do not create a parallel old/new feature implementation.
- Create exactly five points routes and seven discount-code routes in the two sidebar groups named in the spec.
- Server-side code is authoritative for price calculations, exclusivity, usage limits, expiry, permissions and writes.
- Preserve Arabic labels/table fields from the legacy pages and provide English translations.
- Use `apply_patch` for file edits and run TypeScript checks before completion.

## Review Focus

- Expired earned points must never appear in a member's redeemable balance; cover in Task 1.
- A client must not submit points and a member grant together; cover in Task 2.
- Allocation capacity must remain correct under two near-simultaneous grant attempts; cover in Task 3.
- A report with `fromDate` after `toDate` must return a validation error instead of misleading output; cover in Task 4.
- An employee must not access another employee's allocations/grants through an altered query parameter; cover in Task 5.

---

### Task 1: Stabilize point settings, history and report service contracts

**Files:**
- Modify: `backend/src/modules/club-points/club-points.service.ts`
- Modify: `backend/src/modules/club-points/club-points.controller.ts`
- Modify: `backend/src/modules/club-points/dto/club-points.dto.ts`
- Test: `backend/src/modules/club-points/club-points.service.spec.ts`

**Interfaces:**
- Produces `earnedMembersReport(fromDate: string, toDate: string)` and `memberHistoryByCode(memberCode: string)`.
- Produces `activeMembersReport()` returning only positive valid balances.

- [ ] **Step 1: Write failing service tests**

```ts
it('excludes expired earned rows from a balance', async () => {
  prisma.tbl_points_history.findMany.mockResolvedValue([
    { points: 20, deadline: yesterday, activated: 1, deleted: 0 },
  ]);
  await expect(service.calculateBalance('M-1')).resolves.toBe(0);
});

it('rejects an inverted earned-points report date range', async () => {
  await expect(service.earnedMembersReport('2026-09-10', '2026-09-01'))
    .rejects.toThrow('fromDate');
});
```

- [ ] **Step 2: Run the focused test file and verify the tests fail**

Run: `node node_modules/jest/bin/jest.js src/modules/club-points/club-points.service.spec.ts --runInBand`

Expected: FAIL because the report contract/date-range guard is missing or incorrect.

- [ ] **Step 3: Implement the minimal service and DTO changes**

```ts
async earnedMembersReport(fromDate: string, toDate: string) {
  this.assertDateRange(fromDate, toDate);
  return this.prisma.tbl_points_history.groupBy({
    by: ['member_code_fk'],
    where: { date: { gte: new Date(fromDate), lte: endOfDay(toDate) }, deleted: 0 },
    _sum: { points: true },
  });
}
```

Expose separate authenticated GET endpoints for member history, earned report and active-member report; validate date/query DTOs.

- [ ] **Step 4: Run the focused test file and TypeScript check**

Run: `node node_modules/jest/bin/jest.js src/modules/club-points/club-points.service.spec.ts --runInBand; node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false`

Expected: PASS.

### Task 2: Make subscription benefit selection explicit and non-stackable

**Files:**
- Modify: `backend/src/modules/club-subscriptions/dto/upsert-club-subscription.dto.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.spec.ts`

**Interfaces:**
- Consumes `pointsToRedeem?: number` and `memberDiscountGrantId?: number`.
- Produces a persisted subscription with either manual discount, points redemption or grant consumption, never multiple benefit modes.

- [ ] **Step 1: Write the failing exclusivity test**

```ts
it('rejects a subscription that combines points with a member discount grant', async () => {
  await expect(service.create({
    memberId: 7, packageId: 3, pointsToRedeem: 10, memberDiscountGrantId: 9,
  } as CreateClubSubscriptionDto, 1)).rejects.toThrow('one benefit');
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `node node_modules/jest/bin/jest.js src/modules/club-subscriptions/club-subscriptions.service.spec.ts --runInBand`

Expected: FAIL if the test exposes a missing guard.

- [ ] **Step 3: Implement a single benefit-mode resolver**

```ts
private resolveBenefitMode(dto: CreateClubSubscriptionDto) {
  const selected = [dto.pointsToRedeem, dto.memberDiscountGrantId,
    dto.discountType && dto.discountType !== 'none'].filter(Boolean).length;
  if (selected > 1) throw new BadRequestException('Select one benefit only');
}
```

Call it before price calculation and preserve the existing transactional point/grant consumption flow.

- [ ] **Step 4: Run subscription tests and typecheck**

Run: `node node_modules/jest/bin/jest.js src/modules/club-subscriptions/club-subscriptions.service.spec.ts --runInBand; node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false`

Expected: PASS.

### Task 3: Complete discount-code grant and consumption domain behaviour

**Files:**
- Modify: `backend/src/modules/club-subscriptions/club-discount-codes.service.ts`
- Modify: `backend/src/modules/club-subscriptions/club-discount-codes.controller.ts`
- Modify: `backend/src/modules/club-subscriptions/dto/club-discount-code.dto.ts`
- Test: `backend/src/modules/club-subscriptions/club-discount-codes.service.spec.ts`

**Interfaces:**
- Produces `searchAvailableForMember(memberCode: string, actor: AuthUser)` and `memberGrantReport(memberCode?: string, actor: AuthUser)`.
- Produces `usageReport(filters: DiscountUsageReportQuery, actor: AuthUser)`.

- [ ] **Step 1: Write failing allocation and usage tests**

```ts
it('does not grant a code after its employee allocation is exhausted', async () => {
  allocation.num = 1; allocation.used_count = 1;
  await expect(service.grantToMember(grantDto, admin)).rejects.toThrow('capacity');
});

it('does not consume an expired member grant', async () => {
  grant.expire_date = yesterday;
  await expect(service.consumeMemberGrant(3, subscriptionId, tx)).rejects.toThrow('expired');
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node node_modules/jest/bin/jest.js src/modules/club-subscriptions/club-discount-codes.service.spec.ts --runInBand`

Expected: FAIL until capacity/expiry checks are complete.

- [ ] **Step 3: Implement atomic capacity, grant, search and reporting queries**

```ts
await tx.tbl_discount_cobones_employees.updateMany({
  where: { id: allocation.id, used_count: { lt: allocation.num } },
  data: { used_count: { increment: 1 } },
});
if (updated.count !== 1) throw new BadRequestException('Allocation capacity exhausted');
```

Implement reports by joining the legacy grant/consumption rows with member, employee, code and subscription details. Restrict non-admin results to `actor.empCode`.

- [ ] **Step 4: Run focused tests and backend typecheck**

Run: `node node_modules/jest/bin/jest.js src/modules/club-subscriptions/club-discount-codes.service.spec.ts --runInBand; node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false`

Expected: PASS.

### Task 4: Add the twelve route-specific frontend page shells and data hooks

**Files:**
- Create: `frontend/src/features/club-points/api.ts`
- Create: `frontend/src/features/club-points/pages.tsx`
- Create: `frontend/src/features/club-discount-codes/api.ts`
- Create: `frontend/src/features/club-discount-codes/pages.tsx`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/club-routes.ts`
- Test: `frontend/src/features/club-points/pages.test.tsx`

**Interfaces:**
- Consumes the point/report and discount/report API contracts from Tasks 1 and 3.
- Produces twelve page components, one per route in the spec.

- [ ] **Step 1: Write the route inventory test**

```tsx
it.each([
  '/club/points/earn-settings',
  '/club/points/conversion-settings',
  '/club/points/member-history',
  '/club/points/earned-report',
  '/club/points/active-members-report',
])('renders %s', async (path) => {
  renderRouter(path);
  expect(await screen.findByRole('heading')).toBeVisible();
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npm test -- --run frontend/src/features/club-points/pages.test.tsx`

Expected: FAIL because individual routes/pages do not yet exist.

- [ ] **Step 3: Implement pages using reusable form/table primitives**

Create separate exported page components for every spec route. Each component owns its heading, query/filter state and result table; shared API hooks and generic result-table/form controls prevent duplicated network logic. Remove the combined `PointsDiscountsManagementPage` route.

- [ ] **Step 4: Verify route pages compile**

Run: `node node_modules/typescript/bin/tsc -b --pretty false`

Expected: PASS.

### Task 5: Replace navigation and complete Arabic/English translations

**Files:**
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/locales/ar.json`
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/components/layout/sidebar.tsx` only if nested group rendering requires it
- Test: `frontend/src/lib/nav.test.ts`

**Interfaces:**
- Consumes the exact route constants from Task 4.
- Produces two sidebar group IDs with all twelve links and translated labels.

- [ ] **Step 1: Write a failing navigation inventory test**

```ts
it('contains the five point and seven discount-code pages', () => {
  expect(navGroups.find(group => group.id === 'club-points')?.items).toHaveLength(5);
  expect(navGroups.find(group => group.id === 'club-discount-codes')?.items).toHaveLength(7);
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm test -- --run frontend/src/lib/nav.test.ts`

Expected: FAIL because the old combined group has four links.

- [ ] **Step 3: Implement exact sidebar groups and translation keys**

Replace the old `club-points-discounts` group with `club-points` and `club-discount-codes`. Add all specified Arabic and English group/route/page/table strings. Validate both JSON files after editing.

- [ ] **Step 4: Run nav test, JSON parse and frontend build**

Run: `npm test -- --run frontend/src/lib/nav.test.ts; node -e "JSON.parse(require('fs').readFileSync('src/locales/ar.json')); JSON.parse(require('fs').readFileSync('src/locales/en.json'))"; npm run build`

Expected: PASS.

### Task 6: End-to-end verification and cleanup of obsolete combined UI

**Files:**
- Modify: `frontend/src/pages/club/points-discounts-management.tsx` only to remove it if no remaining route imports it
- Modify: `frontend/src/types/club.ts` only for verified API response types
- Test: `backend/src/modules/club-points/club-points.service.spec.ts`
- Test: `backend/src/modules/club-subscriptions/club-discount-codes.service.spec.ts`

**Interfaces:**
- Consumes all route/API contracts from Tasks 1–5.
- Produces a verified migration with no sidebar link or router path to the obsolete combined page.

- [ ] **Step 1: Add a smoke scenario test for grant then consumption**

```ts
it('grants a code, consumes it once with a subscription, then rejects reuse', async () => {
  const grant = await service.grantToMember(grantDto, admin);
  await service.consumeMemberGrant(grant.id, subscriptionId, tx);
  await expect(service.consumeMemberGrant(grant.id, anotherSubscriptionId, tx))
    .rejects.toThrow('already used');
});
```

- [ ] **Step 2: Run all focused backend tests and verify failure/pass state**

Run: `node node_modules/jest/bin/jest.js src/modules/club-points src/modules/club-subscriptions --runInBand`

Expected: PASS after implementation.

- [ ] **Step 3: Remove obsolete combined-page imports/routes and retain no duplicate navigation**

Search: `rg -n "points-discounts|PointsDiscountsManagementPage" frontend/src`

Expected after cleanup: no result except an intentional compatibility redirect, if one is retained.

- [ ] **Step 4: Run final verification**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit --pretty false` in `backend`; `node node_modules/typescript/bin/tsc -b --pretty false` and `npm run build` in `frontend`.

Expected: all commands exit 0.

## Self-review

- Spec coverage: Tasks 1–3 implement all legacy business and reporting rules; Tasks 4–5 create every specified page, route, group and translation; Task 6 verifies subscription consumption and removes the incorrect combined entry point.
- Placeholder scan: no unresolved placeholder or unbounded implementation instruction remains.
- Type consistency: point services use member codes/date strings; discount services use authenticated actor scope; frontend API hooks consume those exact endpoint categories.
- Review Focus coverage: expiry is Task 1; no benefit stacking is Task 2; allocation capacity is Task 3; inverted date filters are Task 1; employee isolation is Task 3.
