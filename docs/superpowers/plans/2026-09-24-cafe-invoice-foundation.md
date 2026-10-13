# Cafe Invoice Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the approved invoice, expense, and purchase-return reporting dimensions and ensure every new cafe sale is recorded with one category and one invoice gender.

**Architecture:** Add only the four approved nullable reporting columns, with a foreign key from the cafe-sale header to the existing `inv_categories` source of truth. The two active cafe-sale write paths validate selected category against the server-resolved cafe products; the UI prevents invalid carts before submission while the backend remains authoritative.

**Tech Stack:** NestJS, Prisma/MySQL, Jest, React, TypeScript, Vite.

**Spec:** `C:\Users\qqqqq\.codex\attachments\a3da13a9-6c32-4b51-b8d8-aefcaf3b0327\Pasted text.txt`

## Global Constraints

- Only `noamany_final_new` is a runtime data source; never read the legacy SQL/database at runtime.
- Do not import historical data or create a compatibility layer.
- Do not implement the three reports in this phase.
- Reuse `inv_categories`; do not create a cafe-category table or duplicate category data.
- `invoice_amount` is the approved purchase-paid value; do not add a purchase paid column.
- Existing unclassified rows remain `NULL`; never infer gender from branch, department, category, or member data.

## Review Focus

- A malicious API caller submits products whose categories do not match the invoice category; the backend rejects it.
- A cafe sale has multiple products from the same category; it is accepted and stores that category once on the header.
- A cafe sale contains a product with no category, or mixes categories; it is rejected rather than guessed.
- Changing a draft invoice category while retaining incompatible lines is rejected.
- Existing rows without newly approved values remain readable because all added dimensions are nullable.

---

### Task 1: Schema and API Contracts

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260924_cafe_invoice_reporting_dimensions/migration.sql`
- Modify: `backend/src/modules/sales/dto/quick-sales.dto.ts`
- Modify: `backend/src/modules/cafe/dto/upsert-cafe-product.dto.ts`
- Test: `backend/src/modules/sales/quick-sales.service.spec.ts`

**Interfaces:**
- Produces `CreateQuickSaleDto.gender: 'male' | 'female'` and `CreateQuickSaleDto.cafeCategoryId: number`.
- Produces `SellCafeCartDto.gender: 'male' | 'female'` and `SellCafeCartDto.cafeCategoryId: number`.
- Produces nullable `sales_quick_sales.gender`, `sales_quick_sales.cafe_category_id`, `fin_expenses.gender_scope`, and `prc_purchase_returns.return_date`.

- [ ] Write failing DTO/service tests requiring invoice gender and category for cafe sales.
- [ ] Run the focused Jest test and verify it fails because the DTO/service does not support the fields.
- [ ] Add the columns, indexes, and `sales_quick_sales.cafe_category_id -> inv_categories.id` foreign key; run Prisma generation.
- [ ] Add validated DTO fields and expose the new sale values from the service mapper.
- [ ] Run focused tests and the backend type check.

### Task 2: Authoritative Cafe Category Validation

**Files:**
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Modify: `backend/src/modules/cafe/cafe-products.service.ts`
- Test: `backend/src/modules/sales/quick-sales.service.spec.ts`
- Test: `backend/src/modules/cafe/cafe-products.service.spec.ts`

**Interfaces:**
- Consumes the DTO fields from Task 1.
- Produces persisted header `gender` and `cafe_category_id` only after server-side verification that every sale line belongs to that category.

- [ ] Write failing tests for a category mismatch, an uncategorized product, and same-category multi-line acceptance.
- [ ] Run focused tests and verify the failures are caused by missing validation.
- [ ] Resolve product categories from `cafe_products.category_id`, reject mismatch/uncategorized lines, and persist the verified header fields in create and draft revision flows.
- [ ] Apply equivalent validation and persistence to `sell-cart`, including its preview path.
- [ ] Run both focused suites and backend type check.

### Task 3: Cafe Invoice UI

**Files:**
- Modify: `frontend/src/pages/sales/new-receipt.tsx`
- Modify: `frontend/src/pages/cafe/pos.tsx`
- Modify: `frontend/src/types/gym-sales.ts`
- Test: `frontend/test/cafe-invoice-category.test.cjs`

**Interfaces:**
- Consumes category and gender values required by the backend.
- Produces payloads that include `gender` and `cafeCategoryId`; product choices are restricted to the selected category.

- [ ] Write a failing frontend source/behavior test for the category and gender payload contract.
- [ ] Run it and verify the contract is absent.
- [ ] Add category and gender selection, clear/reject incompatible cart lines on category changes, filter selectable products, and send both fields on create/revise/sell-cart requests.
- [ ] Preserve the saved category and gender when a draft is loaded; prevent category changes that would make existing lines incompatible.
- [ ] Run frontend tests and frontend type check/build.

### Task 4: End-to-End Verification and Scope Gate

**Files:**
- No report files may change.

- [ ] Run Prisma validation and inspect the generated migration SQL.
- [ ] Run backend focused tests, full backend test suite, backend type check, frontend tests, and frontend build.
- [ ] Verify no monthly-analysis, daily-closing, or target-report source file changed.
- [ ] Stop and report schema/API/UI/validation results without starting report migration.
