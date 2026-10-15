# Cafe Member Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cafe member-code field readable and show the three closest matching gym members while the cashier types.

**Architecture:** Add a branch-scoped quick-sales member search returning at most three minimal member records, ranked by exact and prefix code/card matches. Change the POS customer layout so the member code occupies a full row, the action button sits outside the input, and an accessible result list fills the existing member/customer fields.

**Tech Stack:** NestJS, Prisma, Jest, React, TanStack Query, TypeScript, Tailwind CSS.

**Spec:** User request and screenshot supplied on 2026-08-29.

## Global Constraints

- Search only non-deleted members in the selected cafe branch.
- Return at most three records and expose only member code, card number, name, phone, and active status.
- Keep exact scanner lookup and manual name/mobile entry working.
- Do not add database migrations or change production data.

---

### Task 1: Closest-member API

**Files:**
- Modify: `backend/src/modules/sales/quick-sales.customers.spec.ts`
- Modify: `backend/src/modules/sales/quick-sales.service.ts`
- Modify: `backend/src/modules/sales/quick-sales.controller.ts`

- [ ] Write failing tests for branch scope, result limit, and exact/prefix/contains ranking.
- [ ] Run the focused Jest test and confirm failure.
- [ ] Implement `customerMemberSearch(branchId, query, user)` and its POS-permission route.
- [ ] Re-run the focused Jest test and confirm success.

### Task 2: Readable code field and suggestions

**Files:**
- Modify: `frontend/src/pages/sales/new-receipt-layout.spec.ts`
- Modify: `frontend/src/pages/sales/new-receipt.tsx`

- [ ] Write a failing source-integration test for the full-width code row, separate action button, and three-result search.
- [ ] Add debounced member suggestions with loading, empty, active, and inactive states.
- [ ] Make the code row full-width and place the search button outside the input.
- [ ] Fill customer data when a result is chosen and preserve scanner behavior.
- [ ] Run frontend tests and typecheck.

### Task 3: Verify and package

**Files:**
- Verify all changed source and generated deployment artifacts.

- [ ] Run backend tests and builds.
- [ ] Run frontend tests and production build.
- [ ] Run the Impeccable layout detector.
- [ ] Build and verify a new complete data-free deployment ZIP.

