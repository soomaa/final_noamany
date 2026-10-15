# Cafe Product Multiple Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each cafe product to be assigned to multiple equal categories and appear under every selected category in the POS.

**Architecture:** Store assignments in a normalized `cafe_product_categories` join table while retaining `cafe_products.category_id` as a temporary compatibility mirror of the first selected ID. The API exposes `categoryIds` and `categories`, server filtering matches the join relation, and both frontend trees use the same searchable checkbox multi-select behavior.

**Tech Stack:** MySQL, Prisma 5, NestJS 11, class-validator, React 18, TypeScript, Radix UI, Tailwind CSS, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-cafe-product-multiple-categories-design.md`

**Deployment twin:** Apply the same schema, backend contract, searchable multi-select, and POS behavior to `/Users/fatmaatefkasem/Desktop/caffe copy`. That repository has its own `backend` and `frontend`; its source files are updated directly rather than copying generated `dist` or release artifacts.

## Global Constraints

- All selected cafe categories are equal in the UI and POS.
- Existing products keep their current category after migration.
- `categoryId` and `categoryName` remain compatibility fields derived from the first selected category.
- An empty `categoryIds` array removes all assignments.
- Product mutations and category-assignment replacement are transactional.
- Preserve unrelated changes already present in the dirty worktree.
- Preserve unrelated changes already present in `/Users/fatmaatefkasem/Desktop/caffe copy`.

---

### Task 1: Persist and serialize multiple cafe categories

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/prisma/portable-schema.prisma`
- Create: `backend/prisma/migrations/20260909210000_cafe_product_multiple_categories/migration.sql`
- Modify: `backend/src/modules/cafe/dto/upsert-cafe-product.dto.ts`
- Modify: `backend/src/modules/cafe/cafe-products.service.ts`
- Test: `backend/src/modules/cafe/cafe-products.multiple-categories.spec.ts`

**Interfaces:**
- Consumes: existing `UpsertCafeProductDto.categoryId?: number` compatibility input.
- Produces: `categoryIds?: number[]`, `categories: Array<{ id: number; name: string }>`, and Prisma relation `category_assignments`.

- [ ] **Step 1: Write failing backend tests**

Create focused tests that prove normalization and serialization through real exported helpers:

```ts
expect(normalizeCafeCategoryIds([7, 3, 7])).toEqual([7, 3]);
expect(mapCafeCategories([{ sort_order: 0, category: { id: 7, name_ar: 'قهوة' } }]))
  .toEqual([{ id: 7, name: 'قهوة' }]);
```

Add a service test proving a category filter emits an `OR` that includes `category_assignments.some.category_id` and legacy `category_id`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd backend && npm test -- --runInBand src/modules/cafe/cafe-products.multiple-categories.spec.ts
```

Expected: FAIL because the helpers and relation-aware filter do not exist.

- [ ] **Step 3: Add schema and migration**

Add `cafe_product_categories` with `product_id`, `category_id`, `sort_order`, foreign keys, unique `(product_id, category_id)`, and indexes. Backfill using:

```sql
INSERT INTO cafe_product_categories (product_id, category_id, sort_order)
SELECT id, category_id, 0 FROM cafe_products WHERE category_id IS NOT NULL;
```

Use `INSERT IGNORE` so migration rehearsal remains safe against previously repaired rows.

- [ ] **Step 4: Implement DTO validation and service helpers**

Add:

```ts
@IsOptional()
@IsArray()
@ArrayUnique()
@IsInt({ each: true })
categoryIds?: number[];
```

Export `normalizeCafeCategoryIds(ids?: number[], legacyId?: number): number[]`. Validate all normalized IDs in one `inv_categories.findMany` query with `is_active: true` and `is_deleted: false`. Reject a length mismatch with `BadRequestException('توجد فئة غير متاحة ضمن الفئات المختارة')`.

- [ ] **Step 5: Persist assignments transactionally**

For create, include nested `category_assignments.create` entries. For update, delete existing assignments and create normalized entries inside the existing transaction. Mirror `category_id` and linked inventory category to `normalizedIds[0] ?? null`.

- [ ] **Step 6: Serialize assignments and filter by any assignment**

Include ordered assignments in list/detail/create/update reads:

```ts
category_assignments: {
  orderBy: [{ sort_order: 'asc' }, { category_id: 'asc' }],
  include: { category: { select: { id: true, name_ar: true } } },
}
```

Return `categoryIds`, `categories`, plus compatibility fields. Build category filtering as:

```ts
where.OR = [
  { category_assignments: { some: { category_id: q.categoryId } } },
  { category_id: q.categoryId },
];
```

Combine this safely with the existing search predicate using `AND` rather than overwriting `OR`.

- [ ] **Step 7: Verify GREEN and validate Prisma**

Run:

```bash
cd backend && npx prisma generate && npx prisma validate && npm test -- --runInBand src/modules/cafe/cafe-products.multiple-categories.spec.ts
```

Expected: Prisma validation succeeds and focused tests pass.

### Task 2: Protect category deletion and dependent sales rules

**Files:**
- Modify: `backend/src/modules/inventory/categories.service.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Test: `backend/src/modules/inventory/categories.service.spec.ts`
- Test: `backend/src/modules/sales/employee-benefits.spec.ts`

**Interfaces:**
- Consumes: Prisma relation `cafe_category_assignments` on categories and `category_assignments` on products.
- Produces: deletion protection and employee-benefit eligibility across any assigned category.

- [ ] **Step 1: Write failing behavior tests**

Add a category deletion test where `_count.cafe_category_assignments` is `1` and deletion is rejected. Add a benefits test where the legacy category differs but `category_assignments` contains an eligible category and the product is eligible.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend && npm test -- --runInBand src/modules/inventory/categories.service.spec.ts src/modules/sales/employee-benefits.spec.ts
```

Expected: FAIL because neither consumer reads the new relation.

- [ ] **Step 3: Implement relation-aware checks**

Include `cafe_category_assignments` in category `_count`. In employee benefit product queries, include assignment category IDs and evaluate eligibility with `some(categoryIds.includes)` while keeping the legacy field as fallback.

- [ ] **Step 4: Verify GREEN**

Run the same focused command and expect all tests to pass.

### Task 3: Build tested category selection state

**Files:**
- Create: `frontend/src/lib/cafe-category-selection.ts`
- Create: `frontend/src/lib/cafe-category-selection.spec.ts`
- Create: `caffe/frontend/src/lib/cafe-category-selection.ts`

**Interfaces:**
- Consumes: category options `{ value: string; label: string }[]` and selected IDs `string[]`.
- Produces: `toggleCafeCategory`, `filterCafeCategories`, and `summarizeCafeCategories`.

- [ ] **Step 1: Write failing frontend tests**

Test literal behavior:

```ts
assert.deepEqual(toggleCafeCategory(['2'], '5', true), ['2', '5']);
assert.deepEqual(toggleCafeCategory(['2', '5'], '2', false), ['5']);
assert.deepEqual(filterCafeCategories(options, 'موهيتو').map((row) => row.value), ['9']);
assert.equal(summarizeCafeCategories(options, ['2', '5', '9'], 'بدون فئة'), '3 فئات');
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
cd frontend && npm test -- src/lib/cafe-category-selection.spec.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Normalize Arabic/English search with `trim().toLocaleLowerCase()`, preserve selection order, prevent duplicates, and summarize one or two labels directly while summarizing larger selections by count.

- [ ] **Step 4: Copy the dependency-free helper to the deployment frontend and verify GREEN**

Run:

```bash
cd frontend && npm test -- src/lib/cafe-category-selection.spec.ts
```

Expected: all selection-state tests pass.

### Task 4: Replace the product category dropdown with searchable checklists

**Files:**
- Create: `frontend/src/components/cafe/category-multi-select.tsx`
- Modify: `frontend/src/pages/cafe/products.tsx`
- Modify: `frontend/src/types/cafe.ts`
- Create: `caffe/frontend/src/components/cafe/category-multi-select.tsx`
- Modify: `caffe/frontend/src/pages/cafe/products.tsx`
- Modify: `caffe/frontend/src/types/cafe.ts`

**Interfaces:**
- Consumes: `options`, `value: string[]`, `onValueChange(ids: string[]): void`, `placeholder`.
- Produces: an accessible RTL searchable checkbox popover and payload `categoryIds: number[]`.

- [ ] **Step 1: Update types and form state**

Add:

```ts
categories: Array<{ id: number; name: string }>;
categoryIds: number[];
```

Replace form `categoryId: string` with `categoryIds: string[]`. Hydrate from `row.categoryIds`, falling back to `[row.categoryId]` for compatibility.

- [ ] **Step 2: Implement the reusable multi-select**

Use existing `Popover`, `Input`, `Checkbox`, and `Button` components. The trigger uses `aria-expanded`; the search field uses `aria-label="ابحثي عن فئة"`; each checkbox label has a minimum 44px target; empty results show `لا توجد فئات مطابقة`; and `مسح الاختيارات` clears the value.

- [ ] **Step 3: Wire create, edit, review, and table display**

Send `categoryIds: vars.body.categoryIds.map(Number)`. Show all category names in the review and products table, falling back to `بدون فئة` when empty. Invalidate `cafe-products` after save as before.

- [ ] **Step 4: Mirror the implementation in `caffe/frontend`**

Keep API contracts and UX copy identical so the deployed cafe frontend and main frontend do not drift.

- [ ] **Step 5: Typecheck both frontends**

Run:

```bash
cd frontend && npm run typecheck
cd caffe/frontend && npm run typecheck
```

Expected: both typechecks succeed.

### Task 5: Make POS filtering category-membership aware

**Files:**
- Modify: `frontend/src/pages/cafe/pos.tsx`
- Modify: `caffe/frontend/src/pages/cafe/pos.tsx`
- Modify: `frontend/src/pages/sales/new-receipt.tsx`
- Modify: `caffe/frontend/src/pages/sales/new-receipt.tsx`
- Test: `frontend/src/lib/cafe-category-selection.spec.ts`

**Interfaces:**
- Consumes: `CafeProductListItem.categoryIds` with legacy `categoryId` fallback.
- Produces: `cafeProductMatchesCategory(product, categoryId): boolean`.

- [ ] **Step 1: Add a failing membership test**

Prove that a product with `categoryIds: [2, 5]` matches both `2` and `5`, does not match `7`, and a legacy product with only `categoryId: 3` still matches `3`.

- [ ] **Step 2: Run and verify RED**

Run the focused frontend test and expect failure because the matcher is missing.

- [ ] **Step 3: Implement and wire the matcher**

Use the matcher in client-side cafe POS filters. Keep server-driven receipt filters unchanged except for consuming the backend's relation-aware results. Ensure no flat-mapping is introduced, so unfiltered responses and carts remain unique by product ID.

- [ ] **Step 4: Verify GREEN and run regression tests**

Run:

```bash
cd frontend && npm test -- src/lib/cafe-category-selection.spec.ts
cd backend && npm test -- --runInBand src/modules/cafe/cafe-products.multiple-categories.spec.ts src/modules/inventory/categories.service.spec.ts src/modules/sales/employee-benefits.spec.ts
```

Expected: all focused tests pass.

### Task 6: Full verification and visual audit

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: completed tasks 1–5.
- Produces: migration-safe, buildable multi-category behavior.

- [ ] **Step 1: Run schema and migration checks**

```bash
cd backend && npx prisma validate && npm run prisma:drift:check
```

- [ ] **Step 2: Run backend verification**

```bash
cd backend && npm run typecheck && npm test -- --runInBand src/modules/cafe/cafe-products.multiple-categories.spec.ts src/modules/inventory/categories.service.spec.ts src/modules/sales/employee-benefits.spec.ts && npm run build
```

- [ ] **Step 3: Run frontend verification**

```bash
cd frontend && npm test && npm run build
cd caffe/frontend && npm run build
```

- [ ] **Step 4: Inspect the product dialog once at desktop and mobile widths**

Confirm search, checked states, clear action, long category names, empty results, keyboard focus, RTL alignment, and selected-count overflow. Fix material findings in one batch, then perform one confirmation pass.

- [ ] **Step 5: Review the final diff**

Run `git diff --check` and inspect only the scoped files so unrelated user changes remain untouched.
