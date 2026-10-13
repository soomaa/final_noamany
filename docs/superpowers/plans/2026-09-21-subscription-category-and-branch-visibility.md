# Subscription Category and Branch Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show and filter the persisted subscription category and branch across all club-subscription tables and reports, without changing how packages are scoped.

**Architecture:** Reuse `club_subscriptions.gender` as the category source of truth and expose it as “الفئة” throughout the application. Keep package queries unchanged and branch-scoped; add one shared server-side audience predicate that intersects the employee's branch scope with their `man_women_type` section, enrich mapped subscription rows with a branch name, and make each subscription list/report pass the category filter through its existing query path.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, TypeScript, React, TanStack Query/Table, Jest, Vite.

**Spec:** `docs/superpowers/specs/2026-09-21-subscription-category-and-branch-visibility-design.md`

## Global Constraints

- `club_subscription_types` remains branch-scoped only; no category field or category-based package filtering is added.
- Persist category only as `club_subscriptions.gender`, with the existing values `male` and `female`.
- Display copy is Arabic: `الفئة`, `رجالي`, and `حريمي`.
- User branch scope remains enforced server-side; a supplied branch filter cannot expand it.
- A non-admin user with `man_women_type = 0` reads only `male` subscriptions; `man_women_type = 1` reads only `female` subscriptions, in addition to their assigned branch.
- Missing or invalid non-admin section scope fails closed through `BranchScopeService.memberGenderFilter`; system administrators are unrestricted.
- Existing legacy rows with null category fall back to the linked member's gender in both row mapping and category filters, and are backfilled only when that value exists.

## Review Focus

- A legacy subscription with null `gender` and a linked female member must appear and filter as حريمي.
- A walk-in subscription with no member must still require and retain the staff-selected category.
- Selecting category must not change the branch-filtered package options.
- A branch-scoped user must see only allowed branches even if a different branch id is submitted.
- A Galaa women-section employee must receive only Galaa female subscriptions even with no filters or forged branch/category query parameters.
- CSV/report output must retain branch and category on every row rather than only the on-screen table.

---

### Task 1: Normalise the backend subscription row and category filter

**Files:**
- Create: `backend/prisma/migrations/20260921100000_backfill_subscription_gender/migration.sql`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts:57-145,257-357`
- Modify: `backend/src/modules/club-subscriptions/dto/list-club-subscriptions.dto.ts:1-65`
- Modify: `frontend/src/types/club.ts:222-285`
- Test: `backend/src/modules/club-subscriptions/club-subscriptions.category-branch.spec.ts`

**Interfaces:**
- Consumes: `ListClubSubscriptionsDto.gender`, `club_subscriptions.gender`, `club_subscriptions.branch_id`, and `tbl_branches.branch_name`.
- Produces: every mapped `ClubSubscriptionListItem` has `gender: 'male' | 'female' | null` and `branchName: string | null`; `GET /club-subscriptions?gender=male|female` filters by persisted/fallback category, and all subscription query methods enforce the employee's branch-and-section audience.

- [ ] **Step 1: Write the failing backend tests**

```ts
it('returns the branch name and linked-member category for a legacy subscription', async () => {
  prisma.club_subscriptions.findMany.mockResolvedValue([legacySubscription]);
  prisma.tbl_branches.findMany.mockResolvedValue([{ branch_id: 3, branch_name: 'طنطا' }]);
  prisma.club_members.findMany.mockResolvedValue([{ id: 12, gender: 'female' }]);

  const result = await service.list({ page: '1', pageSize: '20' } as any);

  expect(result.data[0]).toMatchObject({ branchName: 'طنطا', gender: 'female' });
});

it('includes null-category legacy subscriptions when filtering by their linked-member category', async () => {
  await service.list({ page: '1', pageSize: '20', gender: 'female' } as any);

  const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
  expect(where.AND).toEqual(expect.arrayContaining([
    { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
  ]));
});

it('filters by category without widening the authenticated branch scope', async () => {
  await service.list({ page: '1', pageSize: '20', gender: 'male', branch: '99' } as any, user);

  const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
  expect(where.AND).toEqual(expect.arrayContaining([{ gender: 'male' }, { branch_id: { in: [3] } }]));
});

it('forces a Galaa women-section employee to the intersection of branch and category', async () => {
  await service.list({ page: '1', pageSize: '20', branch: '99', gender: 'male' } as any, {
    level: 2, branch: 3, man_women_type: 1,
  } as any);

  const where = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
  expect(where.AND).toEqual(expect.arrayContaining([
    { branch_id: { in: [3] } },
    { OR: [{ gender: 'female' }, { gender: null, member: { is: { gender: 'female' } } }] },
  ]));
});
```

- [ ] **Step 2: Run the new test file and verify it fails**

Run: `npm test -- club-subscriptions.category-branch.spec.ts --runInBand` from `backend`.

Expected: FAIL because branch/category enrichment does not exist for legacy rows.

- [ ] **Step 3: Add the idempotent legacy backfill migration**

```sql
UPDATE club_subscriptions subscriptions
JOIN club_members members ON members.id = subscriptions.member_id
SET subscriptions.gender = members.gender
WHERE subscriptions.gender IS NULL
  AND members.gender IN ('male', 'female');
```

- [ ] **Step 4: Implement the minimal mapping and filter behaviour**

```ts
// In the list path, load only the needed lookup values.
const branchNameById = new Map(branchRows.map((row) => [row.branch_id, row.branch_name ?? null]));

this.mapSub(row, {
  branchName: branchNameById.get(row.branch_id) ?? null,
  category: row.gender ?? row.member?.gender ?? null,
});
```

Add a private `subscriptionAudienceFilter(user)` helper that calls `BranchScopeService.memberGenderFilter(user)` and returns the fallback-aware predicate `{ OR: [{ gender }, { gender: null, member: { is: { gender } } }] }` for a scoped employee. Apply it before the optional query category filter in `list`, `statistics`, `outstandingReport`, `expiredReport`, and all other subscription report queries. Extend the list query with `member: { select: { gender: true } }`, expand `mapSub` extras and `ClubSubscriptionListItem` with `branchName`, retain the existing `gender` API field as the category value, and apply the same enrichment to report/list methods that return subscription rows. Keep `ListClubSubscriptionsDto.gender` limited to `male` and `female`.

- [ ] **Step 5: Run the focused tests and backend typecheck**

Run: `npm test -- club-subscriptions.category-branch.spec.ts club-subscriptions.expired-report.spec.ts --runInBand && npm run typecheck` from `backend`.

Expected: PASS with no TypeScript errors.

### Task 2: Add category and branch to subscription tables, filters, and exports

**Files:**
- Modify: `frontend/src/pages/club/subscriptions.tsx:337-348,1283-1350`
- Modify: `frontend/src/pages/club/subscription-refunds.tsx`
- Modify: `frontend/src/components/club/private-subscriptions.tsx`
- Modify: `frontend/src/pages/reports/club/subscriptions-daily.tsx`
- Modify: `frontend/src/pages/reports/club/subscription-status-reports.tsx`
- Modify: `frontend/src/pages/reports/finance/outstanding-payments.tsx`
- Modify: `frontend/src/pages/club/subscription-reports.tsx`
- Test: `frontend/src/pages/club/subscriptions.category-branch.test.tsx` (only if the existing Vitest setup is present; otherwise validate with typecheck/build and API-backed smoke checks)

**Interfaces:**
- Consumes: `ClubSubscriptionListItem.branchName` and `.gender` from Task 1 plus the existing query filter key `gender`.
- Produces: subscription tables include columns headed `الفرع` and `الفئة`; tables with filters pass `gender` through to `/club-subscriptions`; CSV column sets include both fields.

- [ ] **Step 1: Write the failing frontend table/filter test when a test runner is configured**

```tsx
it('shows branch and category columns and forwards the selected category', async () => {
  render(<ClubSubscriptionsPage />);
  await user.selectOptions(screen.getByLabelText('الفئة'), 'female');

  expect(await screen.findByRole('columnheader', { name: 'الفرع' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'الفئة' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/club-subscriptions', expect.objectContaining({ params: expect.objectContaining({ gender: 'female' }) }));
});
```

- [ ] **Step 2: Run the frontend test and verify it fails**

Run: `npm test -- subscriptions.category-branch.test.tsx` from `frontend` when a test script exists.

Expected: FAIL because the table does not render the two columns consistently.

- [ ] **Step 3: Implement consistent branch and category renderers**

```tsx
const categoryLabel = (gender: ClubSubscriptionListItem['gender']) =>
  gender === 'female' ? 'حريمي' : gender === 'male' ? 'رجالي' : '—';

{ accessorKey: 'branchName', header: 'الفرع', cell: ({ getValue }) => getValue<string | null>() ?? '—' },
{ id: 'category', header: 'الفئة', cell: ({ row }) => categoryLabel(row.original.gender) },
```

Use the same renderer in the standard, special/private, expired, expiring, outstanding, refund, receipt, and member-history subscription tables. Do not place these columns in package-settings tables, and do not modify package selection behavior.

- [ ] **Step 4: Forward filters and extend exports/reports**

```ts
const params = { ...existingParams, gender: filters.gender === 'all' ? undefined : filters.gender };

downloadCsv('subscriptions-report', [
  { label: 'الفرع', value: (row) => row.branchName ?? '—' },
  { label: 'الفئة', value: (row) => categoryLabel(row.gender) },
  ...existingColumns,
]);
```

Add the category selector where a subscription table already exposes filters, preserve existing branch filters, and add both columns to every subscription CSV/report row.

- [ ] **Step 5: Run frontend verification**

Run: `npm run typecheck && npm run build` from `frontend`.

Expected: both commands exit 0.

### Task 3: Verify end-to-end subscription creation and report coverage

**Files:**
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.category-branch.spec.ts`
- Modify: `frontend/src/pages/club/subscriptions.category-branch.test.tsx` when supported

**Interfaces:**
- Consumes: Task 1 API mapping and Task 2 table/export rendering.
- Produces: coverage for selection persistence, legacy fallback, branch scoping, and report output.

- [ ] **Step 1: Add an API persistence test**

```ts
it('preserves the category selected for a walk-in while packages remain selected by branch', async () => {
  await service.create({ branchId: 3, customerName: 'ضيف', gender: 'female', subscriptionTypeId: 8, /* required fields */ } as any, user);

  expect(prisma.club_subscriptions.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ branch_id: 3, gender: 'female', subscription_type_id: 8 }) }),
  );
  expect(prisma.club_subscription_types.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ id: 8 }) }),
  );
});
```

- [ ] **Step 2: Run focused backend tests and verify they pass**

Run: `npm test -- club-subscriptions.category-branch.spec.ts club-subscriptions.renew.spec.ts club-subscriptions.expired-report.spec.ts --runInBand` from `backend`.

Expected: PASS.

- [ ] **Step 3: Smoke-test the running application**

```powershell
Invoke-WebRequest -UseBasicParsing 'http://localhost:4002/api/health'
Invoke-WebRequest -UseBasicParsing 'http://localhost:5174/'
```

Confirm 200 responses, then manually inspect one normal and one legacy subscription list row with the branch and category columns visible; filter by each category and verify counts/rows change without changing package options.

- [ ] **Step 4: Review the final diff and record verification evidence**

Run: `git diff --check` when Git metadata is available; otherwise inspect the changed file list and rerun the commands above.

Expected: no whitespace errors and all required verification commands pass.
