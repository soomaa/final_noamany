# Evaluation Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated, auditable employee evaluation-management module with category and item setup, dynamic evaluation entry, reporting, and navigation.

**Architecture:** A new NestJS module owns validation and persistence for four new Prisma models. The React application exposes four independently lazy-loaded pages that query only the new `/evaluation-management` API. The legacy `/hr/evaluations` page, module, and legacy tables remain untouched.

**Tech Stack:** NestJS 11, Prisma 5/MySQL, class-validator, Jest, React 18, TypeScript, React Query, TanStack Table, Radix Dialog, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-20-evaluation-management-design.md`

## Global Constraints

- Do not change the legacy `evaluations` module, `/hr/evaluations` routes, page, or legacy tables.
- Create all evaluation-management behavior in new files; modify existing files only for Prisma registration, module registration, RBAC catalog, frontend routing, navigation, and translations.
- Preserve RTL, `useLocale`, `ListPageShell`, `DataTable`, `Combobox`, `Dialog`, React Query, and the existing `api` client conventions.
- New tables use InnoDB; FKs are limited to the new tables because legacy sources include MyISAM tables.
- Reference ids for `department_jobs`, `employees`, `tbl_branches`, and `users` are indexed and verified server-side before writes.
- Every new table has `created_at`, `updated_at`, `created_by_id`, and `updated_by_id`; audit actor values always originate in `CurrentUser`, never request bodies.
- Evaluation creation and all its detail rows execute in one Prisma transaction.

## Review Focus

- Category selection with an employee whose `mosma_wazefy_code` does not equal the linked job title’s `dep_code` returns no employee options; cover in Task 3.
- A supplied detail list with an item from a different category is rejected before the transaction writes; cover in Task 4.
- A decimal award greater than the item maximum or below zero is rejected even if the browser validation is bypassed; cover in Task 4.
- A category or item referenced by historical evaluations cannot be deleted; cover in Task 3.
- Two simultaneous evaluation-save requests cannot produce a partial header/detail set; cover the transaction failure path in Task 4.

---

## File Structure

- `backend/prisma/migrations/20260920120000_evaluation_management/migration.sql` — creates the four InnoDB tables, internal FKs, indexes, unique constraints, and audit reference indexes.
- `backend/prisma/schema.prisma` — Prisma models and relations for the new tables.
- `backend/src/modules/evaluation-management/` — module, controller, service, DTOs, and service tests; no legacy-module imports.
- `backend/src/app.module.ts` — imports the new module.
- `backend/src/modules/rbac/catalog/rbac.catalog.ts` — catalogs the four routes so the permission-filtered sidebar displays them.
- `frontend/src/types/evaluation-management.ts` — API response and form types.
- `frontend/src/pages/evaluation-management/*.tsx` — the four pages and their focused shared score-entry component.
- `frontend/src/app/lazy-pages.ts` and `frontend/src/app/router.tsx` — lazy exports and routes.
- `frontend/src/lib/nav.ts`, `frontend/src/locales/ar.json`, `frontend/src/locales/en.json` — navigation placement, icon, and labels.

### Task 1: Add schema and migration for the independent evaluation domain

**Files:**
- Create: `backend/prisma/migrations/20260920120000_evaluation_management/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Test: Prisma schema validation and migration SQL inspection

**Interfaces:**
- Produces Prisma delegates `evaluation_categories`, `evaluation_items`, `employee_evaluations`, and `employee_evaluation_details` used by `EvaluationManagementService`.
- Produces `Decimal` scores mapped as `Prisma.Decimal` in service code.

- [ ] **Step 1: Write the migration SQL with only new tables and constraints**

```sql
CREATE TABLE `evaluation_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `job_title_id` INT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `created_by_id` INT NULL,
  `updated_by_id` INT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_evaluation_categories_name_job_title` (`name`, `job_title_id`),
  KEY `idx_evaluation_categories_job_title` (`job_title_id`),
  KEY `idx_evaluation_categories_created_by` (`created_by_id`),
  KEY `idx_evaluation_categories_updated_by` (`updated_by_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Add equivalent definitions for `evaluation_items`, `employee_evaluations`, and `employee_evaluation_details`; use FK names `fk_evaluation_items_category`, `fk_employee_evaluations_category`, `fk_employee_evaluation_details_evaluation`, and `fk_employee_evaluation_details_item` with `ON DELETE RESTRICT ON UPDATE CASCADE`. Include `(evaluation_id, item_id)` uniqueness and report indexes exactly as specified.

- [ ] **Step 2: Add matching Prisma models and internal relations**

```prisma
model evaluation_categories {
  id             Int                @id @default(autoincrement())
  name           String             @db.VarChar(191)
  job_title_id   Int
  created_at     DateTime           @default(now())
  updated_at     DateTime           @updatedAt
  created_by_id  Int?
  updated_by_id  Int?
  items          evaluation_items[]
  evaluations    employee_evaluations[]

  @@unique([name, job_title_id], map: "uq_evaluation_categories_name_job_title")
  @@index([job_title_id], map: "idx_evaluation_categories_job_title")
  @@map("evaluation_categories")
}
```

Define the remaining models with the relation names from the migration and `@db.Decimal(10, 2)` for all score fields. Do not add Prisma relations to legacy tables; retain only their indexed numeric ids.

- [ ] **Step 3: Validate generated schema before database mutation**

Run: `npm run prisma:validate` from `backend/`

Expected: Prisma validates all four models and reports no ambiguous relation or mapping errors.

- [ ] **Step 4: Apply migration only to the configured local database and regenerate Prisma client**

Run: `npx prisma migrate dev --name evaluation_management && npm run prisma:generate` from `backend/`

Expected: one migration directory exists, the database has exactly four new tables, and generated client exposes all four delegates.

- [ ] **Step 5: Commit the schema task if this workspace is initialized as a Git repository**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260920120000_evaluation_management/migration.sql
git commit -m "feat: add evaluation management schema"
```

### Task 2: Define API contracts, module wiring, and RBAC routes

**Files:**
- Create: `backend/src/modules/evaluation-management/dto/evaluation-management.dto.ts`
- Create: `backend/src/modules/evaluation-management/evaluation-management.module.ts`
- Create: `backend/src/modules/evaluation-management/evaluation-management.controller.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/modules/rbac/catalog/rbac.catalog.ts`
- Test: `backend/src/modules/evaluation-management/evaluation-management.controller.spec.ts`

**Interfaces:**
- Consumes the four Prisma delegates from Task 1.
- Produces controller routes under `/evaluation-management`; Task 5 consumes their request and response shapes.

- [ ] **Step 1: Write failing controller route/guard tests**

```ts
it('binds category creation to the authenticated user and create permission', async () => {
  await controller.createCategory({ name: 'خدمة العملاء', jobTitleId: 7 }, { sub: 23 } as JwtUser);
  expect(service.createCategory).toHaveBeenCalledWith(
    { name: 'خدمة العملاء', jobTitleId: 7 },
    23,
  );
});

it('declares the report endpoint before :id detail endpoint', () => {
  expect(Reflect.getMetadata(PATH_METADATA, EvaluationsManagementController)).toBe('evaluation-management');
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- evaluation-management.controller.spec.ts --runInBand` from `backend/`

Expected: FAIL because the controller/module and DTO exports do not exist.

- [ ] **Step 3: Implement DTOs and controller endpoints with exact contracts**

```ts
export class CreateEvaluationDto {
  @IsInt() categoryId!: number;
  @IsInt() employeeId!: number;
  @IsInt() branchId!: number;
  @IsDateString() evaluationDate!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) evaluationMonth!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EvaluationDetailDto)
  details!: EvaluationDetailDto[];
}

@Post('evaluations')
@RequiresPermission('evaluation-management.add_evaluation:create')
createEvaluation(@Body() dto: CreateEvaluationDto, @CurrentUser() user: JwtUser) {
  return this.service.createEvaluation(dto, user.sub);
}
```

Use static paths before `evaluations/:id`. Provide `GET lookups/job-titles`, `GET lookups/branches`, category/item CRUD, `GET categories/:id/items`, `GET categories/:id/employees`, `POST evaluations`, `GET evaluations`, and `GET evaluations/:id`. Apply matching page-level view/create/update/delete permissions.

- [ ] **Step 4: Register the module and four route permissions in the RBAC catalog**

```ts
group('evaluation-management', 'إدارة التقييمات', 'ClipboardCheck', [
  page('evaluation-management.categories', 'فئات التقييم', '/evaluation-management/categories', LIST, 'Evaluation categories'),
  page('evaluation-management.items', 'بنود التقييم', '/evaluation-management/items', LIST, 'Evaluation items'),
  page('evaluation-management.add_evaluation', 'إضافة تقييم', '/evaluation-management/add', CREATE, 'Add evaluation'),
  page('evaluation-management.report', 'تقرير التقييمات', '/evaluation-management/report', LIST, 'Evaluation report'),
]),
```

Import `EvaluationManagementModule` in `AppModule`. Use the resource keys produced by this catalog exactly in `@RequiresPermission`; do not use the legacy `affairs.evaluations` key.

- [ ] **Step 5: Run focused tests and TypeScript compilation**

Run: `npm test -- evaluation-management.controller.spec.ts --runInBand && npm run typecheck` from `backend/`

Expected: PASS and no type errors.

- [ ] **Step 6: Commit the API contract task if Git is available**

```bash
git add backend/src/app.module.ts backend/src/modules/evaluation-management backend/src/modules/rbac/catalog/rbac.catalog.ts
git commit -m "feat: add evaluation management API contracts"
```

### Task 3: Implement category/item setup and verified lookup operations

**Files:**
- Create: `backend/src/modules/evaluation-management/evaluation-management.service.ts`
- Create: `backend/src/modules/evaluation-management/evaluation-management.service.spec.ts`
- Modify: `backend/src/modules/evaluation-management/evaluation-management.controller.ts`

**Interfaces:**
- Consumes `CreateCategoryDto`, `UpdateCategoryDto`, `CreateItemDto`, `UpdateItemDto` and actor id from Task 2.
- Produces `listCategories()`, `createCategory()`, `updateCategory()`, `removeCategory()`, `listItems()`, `createItem()`, `updateItem()`, `removeItem()`, `listJobTitles()`, and `listBranches()` used by all frontend pages.

- [ ] **Step 1: Write failing service tests for validation, audit fields, and dependent-delete protection**

```ts
it('writes the actor to both audit columns when creating a category', async () => {
  prisma.department_jobs.findUnique.mockResolvedValue({ id: 7, name: 'مدير', dep_code: 401 });
  await service.createCategory({ name: 'الأداء', jobTitleId: 7 }, 23);
  expect(prisma.evaluation_categories.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ name: 'الأداء', job_title_id: 7, created_by_id: 23, updated_by_id: 23 }),
  });
});

it('rejects deleting a category that has items or evaluations', async () => {
  prisma.evaluation_categories.findUnique.mockResolvedValue({ id: 2 });
  prisma.evaluation_items.count.mockResolvedValue(1);
  await expect(service.removeCategory(2)).rejects.toThrow('لا يمكن حذف الفئة');
});

it('rejects a negative max score', async () => {
  await expect(service.createItem({ categoryId: 2, name: 'الالتزام', maxScore: '-1' }, 23))
    .rejects.toThrow('الدرجة العظمى');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- evaluation-management.service.spec.ts --runInBand` from `backend/`

Expected: FAIL because setup methods are not implemented.

- [ ] **Step 3: Implement lookup, category, and item methods with checked references**

```ts
private async categoryOrThrow(id: number) {
  const category = await this.prisma.evaluation_categories.findUnique({ where: { id } });
  if (!category) throw new NotFoundException('فئة التقييم غير موجودة');
  return category;
}

private assertNonNegativeDecimal(value: string, label: string): Prisma.Decimal {
  const score = new Prisma.Decimal(value);
  if (!score.isFinite() || score.isNegative()) throw new BadRequestException(`${label} يجب أن تكون صفراً أو أكبر`);
  return score;
}
```

Verify `department_jobs.id` for a category. For items, verify category existence, normalize trimmed names, reject duplicate names through an explicit lookup and translate `P2002` to an Arabic conflict error. On edits set `updated_by_id` and leave creation columns unchanged. Return list rows with category/job-title labels in one query path rather than browser-side joins.

- [ ] **Step 4: Implement lookup source projections**

```ts
async listJobTitles() {
  const rows = await this.prisma.department_jobs.findMany({ orderBy: { id: 'asc' } });
  return rows.map((row) => ({ id: row.id, name: row.name, code: row.dep_code }));
}

async listBranches() {
  const rows = await this.prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' } });
  return rows.map((row) => ({ id: row.branch_id, name: row.branch_name }));
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- evaluation-management.service.spec.ts --runInBand && npm run typecheck` from `backend/`

Expected: PASS, including the three Review Focus cases owned by this task.

- [ ] **Step 6: Commit the setup service task if Git is available**

```bash
git add backend/src/modules/evaluation-management
git commit -m "feat: manage evaluation categories and items"
```

### Task 4: Implement dynamic evaluation entry and reporting persistence

**Files:**
- Modify: `backend/src/modules/evaluation-management/evaluation-management.service.ts`
- Modify: `backend/src/modules/evaluation-management/evaluation-management.service.spec.ts`
- Modify: `backend/src/modules/evaluation-management/dto/evaluation-management.dto.ts`

**Interfaces:**
- Consumes category/item operations from Task 3 and `CreateEvaluationDto` from Task 2.
- Produces `employeesForCategory(categoryId, branchId?)`, `itemsForCategory(categoryId)`, `createEvaluation(dto, actorId)`, `listEvaluations(query)`, and `getEvaluation(id)` for Tasks 6–7.

- [ ] **Step 1: Write failing tests for category employee matching, atomic saves, and report filters**

```ts
it('returns only employees matching the selected category job-title code and branch', async () => {
  prisma.evaluation_categories.findUnique.mockResolvedValue({ id: 4, job_title_id: 7 });
  prisma.department_jobs.findUnique.mockResolvedValue({ id: 7, dep_code: 401 });
  await service.employeesForCategory(4, 3);
  expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { mosma_wazefy_code: 401, branch_id_fk: 3 },
  }));
});

it('does not create an evaluation when one detail exceeds its snapshot maximum', async () => {
  await expect(service.createEvaluation(validEvaluation({ awardedScore: '11' }), 23))
    .rejects.toThrow('لا يمكن أن تتجاوز الدرجة الممنوحة');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('applies category, employee, and inclusive date filters to the report query', async () => {
  await service.listEvaluations({ categoryId: 4, employeeId: 8, dateFrom: '2026-09-01', dateTo: '2026-09-30', page: 1, pageSize: 20 });
  expect(prisma.employee_evaluations.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { category_id: 4, employee_id: 8, evaluation_date: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30T23:59:59.999Z') } },
  }));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- evaluation-management.service.spec.ts --runInBand` from `backend/`

Expected: FAIL because dynamic lookup, transaction, and report methods do not exist.

- [ ] **Step 3: Implement employee/item lookups with category membership checks**

```ts
async employeesForCategory(categoryId: number, branchId?: number) {
  const category = await this.categoryOrThrow(categoryId);
  const job = await this.prisma.department_jobs.findUnique({ where: { id: category.job_title_id } });
  if (!job?.dep_code) return [];
  return this.prisma.employees.findMany({
    where: { mosma_wazefy_code: job.dep_code, ...(branchId ? { branch_id_fk: branchId } : {}) },
    select: { id: true, employee: true, emp_code: true, branch_id_fk: true },
    orderBy: { employee: 'asc' },
  });
}
```

Validate branch existence when supplied and reject employee ids that are not included in this matching result. Return category items ordered by `id` and expose only id/name/maxScore.

- [ ] **Step 4: Save a frozen evaluation header and details atomically**

```ts
return this.prisma.$transaction(async (tx) => {
  const evaluation = await tx.employee_evaluations.create({
    data: { category_id: dto.categoryId, employee_id: dto.employeeId, branch_id: dto.branchId,
      evaluation_date: new Date(dto.evaluationDate), evaluation_month: dto.evaluationMonth,
      created_by_id: actorId, updated_by_id: actorId },
  });
  await tx.employee_evaluation_details.createMany({
    data: resolvedItems.map((item) => ({ evaluation_id: evaluation.id, item_id: item.id,
      item_name_snapshot: item.name, max_score_snapshot: item.max_score,
      awarded_score: requestedScores.get(item.id)!, created_by_id: actorId, updated_by_id: actorId })),
  });
  return { id: evaluation.id };
});
```

Before this transaction, verify the exact set of requested item ids equals the current category’s item ids, no id repeats, every award is in range, the employee exists and matches the category/job/branch, and date/month DTO validation passed. This ensures a transaction never begins for invalid input.

- [ ] **Step 5: Implement report rows and the detail-modal response**

Return report data shaped as `{ id, evaluationDate, evaluationMonth, categoryName, employeeName, branchName, createdAt, createdByName, updatedAt, updatedByName }`. `getEvaluation` must return the frozen detail snapshots, ordered by detail id, and audit labels by querying `users` with the stored ids. Use `paginated(data, total, page, pageSize)` to match existing list APIs.

- [ ] **Step 6: Run full module tests, transaction failure test, and backend typecheck**

Run: `npm test -- evaluation-management --runInBand && npm run typecheck` from `backend/`

Expected: PASS; an injected `createMany` rejection leaves no persisted evaluation header in the transaction mock/integration test.

- [ ] **Step 7: Commit the evaluation workflow task if Git is available**

```bash
git add backend/src/modules/evaluation-management
git commit -m "feat: save and report employee evaluations"
```

### Task 5: Add frontend contracts and reusable score-entry UI

**Files:**
- Create: `frontend/src/types/evaluation-management.ts`
- Create: `frontend/src/components/evaluation-management/score-entry-table.tsx`
- Test: `frontend/src/components/evaluation-management/score-entry-table.test.tsx`

**Interfaces:**
- Consumes API shapes created in Task 4.
- Produces `EvaluationCategory`, `EvaluationItem`, `EvaluationRow`, `EvaluationDetails`, and `ScoreEntryTable` used by Tasks 6–7.

- [ ] **Step 1: Write a failing score-entry validation test**

```tsx
it('marks a score above the maximum invalid and calls onChange only for valid decimals', async () => {
  render(<ScoreEntryTable items={[{ id: 1, name: 'الالتزام', maxScore: '5' }]} values={{}} onChange={onChange} />);
  await userEvent.type(screen.getByLabelText('الدرجة الممنوحة: الالتزام'), '6');
  expect(screen.getByText('الدرجة لا تتجاوز 5')).toBeVisible();
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- score-entry-table.test.tsx --runInBand` from `frontend/` if a frontend test runner is configured; otherwise run `npm run typecheck` after implementation and manually exercise this exact case in the browser.

Expected: the test fails because the component does not exist, or typecheck initially cannot resolve its import.

- [ ] **Step 3: Define API types and build the controlled table**

```ts
export interface EvaluationItem { id: number; categoryId: number; name: string; maxScore: string; }
export interface EvaluationScore { itemId: number; awardedScore: string; }
```

```tsx
<Input
  aria-label={`${ui('الدرجة الممنوحة:')} ${item.name}`}
  type="number"
  min="0"
  max={item.maxScore}
  step="0.01"
  value={values[item.id] ?? ''}
  onChange={(event) => onScoreChange(item.id, event.target.value)}
/>
```

Render the requested columns (item name, maximum score, awarded score), show a per-row Arabic error for invalid values, and expose `isValid` so the Add Evaluation page can disable saving.

- [ ] **Step 4: Run frontend typecheck**

Run: `npm run typecheck` from `frontend/`

Expected: PASS with no JSX or API type errors.

- [ ] **Step 5: Commit the shared frontend task if Git is available**

```bash
git add frontend/src/types/evaluation-management.ts frontend/src/components/evaluation-management
git commit -m "feat: add evaluation score entry component"
```

### Task 6: Build category and item management pages

**Files:**
- Create: `frontend/src/pages/evaluation-management/categories.tsx`
- Create: `frontend/src/pages/evaluation-management/items.tsx`
- Test: Browser/manual checks stated below; existing frontend configuration has no confirmed component-test script.

**Interfaces:**
- Consumes `EvaluationCategory`, `EvaluationItem`, `api`, `usePaginatedList`, `useMutationWithToast`, and Task 5 types.
- Produces named exports `EvaluationCategoriesPage` and `EvaluationItemsPage` consumed by Task 8 lazy imports.

- [ ] **Step 1: Build the category page around the existing CRUD UI primitives**

```tsx
const { data, isLoading, isError, refetch } = usePaginatedList<EvaluationCategory>('evaluation-management/categories', params);
const save = async (payload: CategoryForm) => {
  if (editId) await api.patch(`/evaluation-management/categories/${editId}`, payload);
  else await api.post('/evaluation-management/categories', payload);
  await queryClient.invalidateQueries({ queryKey: ['evaluation-management/categories'] });
};
```

Use `ListPageShell`, `DataTable`, `Combobox`, `Dialog`, `confirm`, and the standard edit/delete icon buttons. Fetch job-title options from `/evaluation-management/lookups/job-titles`; show name, job title, and actions.

- [ ] **Step 2: Build the item page with category selection and decimal maximum**

```tsx
await api.post('/evaluation-management/items', {
  categoryId: Number(form.categoryId),
  name: form.name.trim(),
  maxScore: form.maxScore,
});
```

Use the same shell and dialog pattern; fetch categories from the new API, use `type="number" min="0" step="0.01"`, and list category, item name, maximum score, and actions.

- [ ] **Step 3: Typecheck and manually verify both CRUD pages**

Run: `npm run typecheck` from `frontend/`

Manual browser check: create a category, edit it, create an item, reject a negative maximum, and confirm a referenced category/item returns the backend delete-protection message without removing its row.

- [ ] **Step 4: Commit the setup pages task if Git is available**

```bash
git add frontend/src/pages/evaluation-management/categories.tsx frontend/src/pages/evaluation-management/items.tsx
git commit -m "feat: add evaluation category and item pages"
```

### Task 7: Build add-evaluation and report pages

**Files:**
- Create: `frontend/src/pages/evaluation-management/add-evaluation.tsx`
- Create: `frontend/src/pages/evaluation-management/report.tsx`
- Test: Browser/manual dynamic-flow and report-filter checks

**Interfaces:**
- Consumes `ScoreEntryTable` from Task 5 and the Task 4 endpoints.
- Produces named exports `AddEvaluationPage` and `EvaluationReportPage` consumed by Task 8.

- [ ] **Step 1: Implement dependent React Query requests for the entry form**

```tsx
const itemsQuery = useQuery({
  queryKey: ['evaluation-management', 'categories', categoryId, 'items'],
  queryFn: () => api.get<EvaluationItem[]>(`/evaluation-management/categories/${categoryId}/items`).then((r) => r.data),
  enabled: !!categoryId,
});
const employeesQuery = useQuery({
  queryKey: ['evaluation-management', 'categories', categoryId, 'employees', branchId],
  queryFn: () => api.get<EmployeeOption[]>(`/evaluation-management/categories/${categoryId}/employees`, { params: { branchId } }).then((r) => r.data),
  enabled: !!categoryId,
});
```

Clear selected employee and score values when the category changes; clear only employee when the branch changes. Load branch options from the new lookup endpoint. Render date and month inputs (`type="date"`, `type="month"`) and prevent save until every selected item has a valid score.

- [ ] **Step 2: Submit the evaluation with the exact DTO contract**

```tsx
await api.post('/evaluation-management/evaluations', {
  categoryId: Number(categoryId), employeeId: Number(employeeId), branchId: Number(branchId),
  evaluationDate, evaluationMonth,
  details: items.map((item) => ({ itemId: item.id, awardedScore: scores[item.id] })),
});
```

On success toast, reset the full form, and invalidate `['evaluation-management', 'evaluations']`.

- [ ] **Step 3: Implement the report filters, paged table, and details dialog**

```tsx
const report = usePaginatedList<EvaluationRow>('evaluation-management/evaluations', {
  ...params, categoryId: filter.categoryId || undefined, employeeId: filter.employeeId || undefined,
  dateFrom: filter.dateFrom || undefined, dateTo: filter.dateTo || undefined,
});
```

Render the required columns: date, month, category, employee, and a details button. Fetch `/evaluation-management/evaluations/:id` only while its Dialog is open. The dialog must list frozen item name, maximum score, and awarded score, plus created/updated timestamps and actor names when returned.

- [ ] **Step 4: Typecheck and manually verify the critical workflow**

Run: `npm run typecheck` from `frontend/`

Manual browser check: select a category and confirm only matching employee options appear; choose a branch and confirm the list narrows; verify a score above the displayed maximum cannot be saved; create a valid evaluation; filter it by category, employee, and date range; open details and confirm the stored snapshot values match entry values.

- [ ] **Step 5: Commit the workflow pages task if Git is available**

```bash
git add frontend/src/pages/evaluation-management/add-evaluation.tsx frontend/src/pages/evaluation-management/report.tsx
git commit -m "feat: add evaluation entry and report pages"
```

### Task 8: Register routes, navigation, translations, and final verification

**Files:**
- Modify: `frontend/src/app/lazy-pages.ts`
- Modify: `frontend/src/app/router.tsx`
- Modify: `frontend/src/lib/nav.ts`
- Modify: `frontend/src/locales/ar.json`
- Modify: `frontend/src/locales/en.json`
- Test: builds, Prisma validation, focused backend test suite, and browser smoke test

**Interfaces:**
- Consumes the four named page exports from Tasks 6–7 and RBAC catalog routes from Task 2.
- Produces user-accessible routes and the sidebar section requested in the approved design.

- [ ] **Step 1: Add lazy exports and exact React Router paths**

```ts
export const EvaluationCategoriesPage = lazyPage(() => import('@/pages/evaluation-management/categories'), 'EvaluationCategoriesPage');
export const EvaluationItemsPage = lazyPage(() => import('@/pages/evaluation-management/items'), 'EvaluationItemsPage');
export const AddEvaluationPage = lazyPage(() => import('@/pages/evaluation-management/add-evaluation'), 'AddEvaluationPage');
export const EvaluationReportPage = lazyPage(() => import('@/pages/evaluation-management/report'), 'EvaluationReportPage');
```

Add matching routes: `evaluation-management/categories`, `evaluation-management/items`, `evaluation-management/add`, and `evaluation-management/report` inside the authenticated app shell.

- [ ] **Step 2: Insert the navigation section immediately after HR**

```ts
{
  id: 'evaluation-management',
  icon: ClipboardCheck,
  items: [
    { to: '/evaluation-management/categories' },
    { to: '/evaluation-management/items' },
    { to: '/evaluation-management/add' },
    { to: '/evaluation-management/report' },
  ],
},
```

Place this object directly after the `hr` object in `NAV_SECTIONS`, import `ClipboardCheck`, and add Arabic/English `nav.sections.evaluation-management`, `nav.sectionDesc.evaluation-management`, and all four `nav.routes./evaluation-management/...` values. Do not change sidebar component JSX: it already renders the central navigation data as a collapsible section.

- [ ] **Step 3: Run backend verification**

Run: `npm run prisma:validate && npm test -- evaluation-management --runInBand && npm run typecheck && npm run build` from `backend/`

Expected: Prisma schema validates, focused tests pass, and TypeScript/Nest build succeeds.

- [ ] **Step 4: Run frontend verification**

Run: `npm run typecheck && npm run build` from `frontend/`

Expected: all four lazy imports resolve, routes compile, and Vite produces a production bundle.

- [ ] **Step 5: Execute final authenticated browser smoke test**

Check that the new section appears after HR for a role with its `view` permissions, while the legacy Evaluation page continues to load at `/hr/evaluations`. Exercise category/item creation, dynamic employee/item loading, evaluation save, report filtering, and details dialog. Then sign in with a role without `evaluation-management:*:view` and confirm the entire new sidebar section is hidden.

- [ ] **Step 6: Commit integration only if Git is available**

```bash
git add frontend/src/app/lazy-pages.ts frontend/src/app/router.tsx frontend/src/lib/nav.ts frontend/src/locales/ar.json frontend/src/locales/en.json
git commit -m "feat: expose evaluation management navigation"
```

## Plan Self-Review

- **Spec coverage:** Tasks 1–4 implement storage, auditing, validation, AJAX lookup behavior, transaction safety, and reporting. Tasks 5–7 implement the four specified UI pages. Task 8 registers RBAC, navigation placement, routes, translations, and verifies legacy isolation.
- **Placeholder scan:** No deferred implementation placeholders are present; exact routes, types, persistence fields, validation behavior, and commands are specified.
- **Type consistency:** Backend uses `categoryId`, `employeeId`, `branchId`, `evaluationDate`, `evaluationMonth`, and `details[{ itemId, awardedScore }]` consistently. Frontend resource names use `/evaluation-management` consistently.
- **Review focus coverage:** Employee mismatch and delete protection are in Task 3; cross-category item, score bounds, and transaction atomicity are in Task 4.
