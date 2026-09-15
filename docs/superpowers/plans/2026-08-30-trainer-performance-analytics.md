# Trainer Performance and Branch Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable trainer targets and evaluations, trainer performance reporting, and branch/reception operational analytics with scoped permissions.

**Architecture:** Extend the existing `club-fitness` module with performance configuration, monthly snapshots, and reporting APIs. Reuse existing trainer, subscription, private-attendance commission, receipt, branch-scope, and sales-shift data; add focused React pages beneath the current trainer settings hub.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, Jest, React 18, TypeScript, TanStack Query, Tailwind, React Router.

**Spec:** `docs/superpowers/specs/2026-08-30-trainer-performance-analytics-design.md`

## Global Constraints

- Targets, evaluations, and scores apply to trainers only; never create targets/evaluations for reception staff.
- Only system administration configures evaluation criteria and trainer targets; branch managers may score trainers in their allowed branches only.
- Preserve historical results by snapshotting criterion title and max score into every monthly evaluation.
- Store a monthly target override separately; it supersedes the trainer's default only for the selected month.
- Report private-sales and subscriptions achievement separately; do not invent a combined percentage.
- Reception analytics are factual, scoped by branch, and contain no target or evaluation fields.

---

### Task 1: Persist trainer performance configuration and monthly records

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/modules/club-fitness/trainer-performance.service.spec.ts`
- Create: `backend/src/modules/club-fitness/trainer-performance.service.ts`

**Interfaces:**
- Produces `TrainerPerformanceService.resolveTarget(trainerId: number, month: string)` returning `{ privateSalesTarget: number, subscriptionsTarget: number, source: 'override' | 'default' }`.
- Produces `TrainerPerformanceService.createOrUpdateEvaluation(input, user)` returning a monthly evaluation with immutable item snapshots.

- [ ] **Step 1: Write failing service tests**

```ts
it('uses only the selected-month target override', async () => {
  prisma.club_trainer_target_overrides.findUnique.mockResolvedValue({ private_sales_target: 6000, subscriptions_target: 4 });
  await expect(service.resolveTarget(9, '2026-08')).resolves.toMatchObject({ privateSalesTarget: 6000, subscriptionsTarget: 4, source: 'override' });
});

it('snapshots the criterion label and maximum score into an evaluation item', async () => {
  await service.createOrUpdateEvaluation({ trainerId: 9, month: '2026-08', items: [{ criterionId: 3, score: 8 }] }, branchManagerUser);
  expect(prisma.club_trainer_evaluation_items.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ criterion_title: 'الالتزام', max_score: 10, score: 8 })] }));
});
```

- [ ] **Step 2: Run the tests and verify they fail because the service/models do not exist**

Run: `npm test -- trainer-performance.service.spec.ts --runInBand`

- [ ] **Step 3: Add the Prisma models and relations**

```prisma
model club_trainer_evaluation_criteria {
  id Int @id @default(autoincrement())
  title String @db.VarChar(150)
  description String? @db.VarChar(500)
  max_score Int
  sort_order Int @default(0)
  is_active Boolean @default(true)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  @@map("club_trainer_evaluation_criteria")
}

model club_trainer_targets {
  trainer_id Int @id
  private_sales_target Decimal @default(0) @db.Decimal(12, 2)
  subscriptions_target Int @default(0)
  updated_by Int?
  updated_at DateTime @updatedAt
  trainer club_trainers @relation(fields: [trainer_id], references: [id], onDelete: Cascade)
  @@map("club_trainer_targets")
}
```

Add `club_trainer_target_overrides`, `club_trainer_evaluations`, and `club_trainer_evaluation_items` with unique keys `[trainer_id, target_month]` and `[trainer_id, evaluation_month]`; evaluation items must retain `criterion_title`, `max_score`, and `score`.

- [ ] **Step 4: Implement `TrainerPerformanceService`**

Use `assertDateOrder`-style validation for months (`YYYY-MM`), validate score ranges against active criteria, resolve default/override targets, and upsert evaluations in a transaction by replacing only the selected month's item snapshots.

- [ ] **Step 5: Run the focused tests and Prisma validation**

Run: `npm test -- trainer-performance.service.spec.ts --runInBand && npm run prisma:validate`

### Task 2: Expose secured configuration, evaluation, profile, and analytics APIs

**Files:**
- Modify: `backend/src/modules/club-fitness/club-fitness.module.ts`
- Modify: `backend/src/modules/club-fitness/club-trainers.controller.ts`
- Modify: `backend/src/modules/club-fitness/club-trainers.service.ts`
- Create: `backend/src/modules/club-fitness/trainer-performance.controller.ts`
- Create: `backend/src/modules/club-fitness/dto/trainer-performance.dto.ts`
- Create: `backend/src/modules/club-fitness/trainer-performance.controller.spec.ts`

**Interfaces:**
- Consumes Task 1's `TrainerPerformanceService`.
- Produces `/club-trainer-performance/criteria`, `/targets`, `/evaluations`, `/trainers/:id/profile`, `/branch-analytics`, and `/reception-analytics`.

- [ ] **Step 1: Write failing controller tests for permission and branch scope**

```ts
it('rejects a branch manager who evaluates a trainer outside their branch', async () => {
  branchScope.isBranchAllowed.mockReturnValue(false);
  await expect(service.createOrUpdateEvaluation(payload, branchManager)).rejects.toThrow('لا تملك صلاحية الوصول لبيانات هذا الفرع');
});

it('does not expose target/evaluation fields in reception analytics', async () => {
  await expect(service.receptionAnalytics({ branchId: 2, month: '2026-08' }, admin)).resolves.not.toHaveProperty('target');
});
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run: `npm test -- trainer-performance.controller.spec.ts --runInBand`

- [ ] **Step 3: Add explicit permission endpoints**

Use existing `@RequiresPermission` and `BranchScopeService`: configuration mutations require `club.fitness:update`; evaluation writes allow `club.fitness:update` but enforce the trainer branch; reads require `club.fitness:view`.

- [ ] **Step 4: Implement profile and factual analytics queries**

`trainerProfile` must aggregate private subscription value by `private_trainer_id` and subscriptions by the trainer-linked employee ID in the requested month. `branchAnalytics` must aggregate branch revenue, registrations, private sales, trainer rows, reception rows, and shifts. `receptionAnalytics` must use actual `created_by` records and sales-shift data without performance fields.

- [ ] **Step 5: Run focused tests and backend typecheck**

Run: `npm test -- trainer-performance.service.spec.ts trainer-performance.controller.spec.ts --runInBand && npm run typecheck`

### Task 3: Add trainer-performance management pages and routes

**Files:**
- Modify: `frontend/src/lib/fitness-routes.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/pages/club/fitness/trainers/settings.tsx`
- Modify: `frontend/src/pages/club/fitness/trainers/search.tsx`
- Modify: `frontend/src/pages/club/fitness/trainers/ratings.tsx`
- Create: `frontend/src/pages/club/fitness/trainers/performance-settings.tsx`
- Create: `frontend/src/pages/club/fitness/trainers/evaluation.tsx`
- Create: `frontend/src/pages/club/fitness/trainers/performance.tsx`
- Modify: `frontend/src/types/fitness.ts`

**Interfaces:**
- Consumes Task 2 APIs.
- Produces routes under `/club/fitness/trainer-performance-*` and typed client models.

- [ ] **Step 1: Write failing frontend route/navigation tests**

```ts
expect(FITNESS_ROUTES.trainers.performance).toBe('/club/fitness/trainer-performance');
expect(FITNESS_ROUTES.trainers.evaluation).toBe('/club/fitness/trainer-evaluation');
```

- [ ] **Step 2: Run the frontend typecheck and confirm routes are missing**

Run: `npm run typecheck`

- [ ] **Step 3: Build the settings page**

Create tabs for criteria and targets. Criteria supports title, optional description, max score, sort order, and enabled state. Targets supports trainer selection, default private-sales target, default subscriptions target, and a selected-month override.

- [ ] **Step 4: Build the evaluation and performance pages**

Evaluation selects month/branch/trainer, renders active criteria, validates score range in the browser, and saves the branch-manager evaluation. Performance displays separate target progress cards, evaluation detail, and earning summary. Extend existing search/ratings pages to deep-link to the performance profile rather than duplicate calculations.

- [ ] **Step 5: Run frontend typecheck and build**

Run: `npm run typecheck && npm run build`

### Task 4: Add branch and reception analytics pages

**Files:**
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/fitness-routes.ts`
- Create: `frontend/src/pages/club/fitness/branch-analytics.tsx`
- Create: `frontend/src/pages/club/fitness/reception-analytics.tsx`
- Modify: `frontend/src/pages/club/fitness/trainers/settings.tsx`

**Interfaces:**
- Consumes `/club-trainer-performance/branch-analytics` and `/club-trainer-performance/reception-analytics` from Task 2.

- [ ] **Step 1: Write a failing render/type test for the analytics response models**

```ts
const row: ReceptionAnalyticsRow = { employeeId: 4, employeeName: 'A', shiftName: 'Morning', totalSales: 500, subscriptionsCount: 2, subscriptionsValue: 300, otherSales: 200 };
expect(row).not.toHaveProperty('target');
```

- [ ] **Step 2: Run typecheck and verify the new model/page import is absent**

Run: `npm run typecheck`

- [ ] **Step 3: Implement branch analytics**

Add branch and date/month filters, summary cards, a trainer performance table, and a reception-shift summary. Respect the API's branch scope and do not provide client controls that imply access beyond the user's branch.

- [ ] **Step 4: Implement reception analytics**

Add branch, employee, shift, and period filters; render total shift sales, registered subscription count/value, and other sales. Do not render target, percentage, rating, or score columns.

- [ ] **Step 5: Run frontend typecheck and build**

Run: `npm run typecheck && npm run build`

### Task 5: End-to-end verification and handoff

**Files:**
- Modify: `docs/SYSTEM_FULL_TEST_REPORT_2026-08-14.md` (append a dated verification entry)

- [ ] **Step 1: Run all focused backend tests**

Run: `npm test -- trainer-performance --runInBand`

- [ ] **Step 2: Run backend and frontend production checks**

Run: `npm --prefix backend run typecheck && npm --prefix frontend run build`

- [ ] **Step 3: Verify requirements against the spec**

Confirm the six acceptance criteria in `docs/superpowers/specs/2026-08-30-trainer-performance-analytics-design.md` with test names or build evidence, and record the result in the test report.

- [ ] **Step 4: Commit**

If this workspace is attached to a Git repository, commit the implementation with message `feat: add trainer performance analytics`. If it is not a Git repository, report that fact without creating a commit.
