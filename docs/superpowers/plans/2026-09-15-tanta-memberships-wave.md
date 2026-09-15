# Tanta Branch and Memberships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Execute tasks in order and do not apply migrations to the configured live database.

**Goal:** Implement configurable Tanta branch-family behavior and authoritative branch-specific membership configuration.

**Architecture:** Physical branches remain available for pricing and subscription operations. A canonical branch relationship supplies shared member identity, access, duplicate detection, display, and report aggregation through one reusable backend resolver.

**Tech Stack:** NestJS 11, Prisma 5, MySQL, React 18, TypeScript, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-platform-modernization.md`

## Global Constraints

- Do not connect to, alter, migrate, seed, or reset the configured database.
- Do not hard-code Tanta numeric IDs or branch names in business logic.
- Do not trust a client-submitted price.
- Keep migrations additive and forward-only.
- Preserve historical member marketing data while removing its entry controls.
- Use red-green-refactor for every behavior change.

---

### Task 1: Canonical branch-family resolver

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260915_add_canonical_branch_family/migration.sql`
- Create or modify: `backend/src/common/branch-scope/branch-family.service.ts`
- Create or modify: `backend/src/common/branch-scope/branch-family.service.spec.ts`
- Modify: `backend/src/common/branch-scope/branch-scope.module.ts`
- Modify: `backend/src/modules/club-members/club-branch-groups.ts`

**Interfaces:**
- Produce `getCanonicalBranchId(branchId)`, `getFamilyBranchIds(branchId)`, and `areInSameFamily(leftId, rightId)`.
- Root branches resolve to themselves when `canonical_branch_id` is null or self-referencing during rollout.

- [ ] Write failing unit tests for root, child, sibling, missing, and cyclic branch relationships.
- [ ] Run the focused tests and verify the expected failure.
- [ ] Add the nullable self-relation and additive SQL column/index/foreign key.
- [ ] Implement the minimal resolver with cycle protection and deterministic ordering.
- [ ] Replace the hard-coded club report expansion with the resolver.
- [ ] Run focused tests, Prisma validation, and backend typecheck.

### Task 2: Member family behavior

**Files:**
- Modify: `backend/src/modules/club-members/club-members.service.ts`
- Modify: `backend/src/modules/club-members/club-member-duplicates.ts`
- Modify or create focused Jest specifications beside those modules.
- Modify: `frontend/src/pages/club/members.tsx`

**Interfaces:**
- Member code locking and prefix sequence are canonical-family scoped.
- Duplicate lookup searches the full family.
- Member responses expose operational branch and canonical display branch.

- [ ] Write failing tests proving Tanta siblings share a code sequence and duplicate scope.
- [ ] Verify RED.
- [ ] Implement family-based generation, lookup, and canonical display mapping.
- [ ] Remove marketing/follow-up controls and payload fields from member creation while preserving registrar audit behavior.
- [ ] Verify focused tests and both typechecks.

### Task 3: Branch-specific package prices and class allocation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260915_add_package_class_allocation/migration.sql`
- Modify package DTO/service/controller files under `backend/src/modules/club-subscriptions/`.
- Modify package administration UI under `frontend/src/pages/club/`.
- Add focused backend and frontend model tests.

**Interfaces:**
- Per-branch configuration contains enabled, price, linkedToSessions, sessionsCount, classPercentageEnabled, and classPercentage.
- `sessionsCount` is required only when linked; `classPercentage` is required only when enabled and must be within 0..100.

- [ ] Write failing validation and authoritative-price tests.
- [ ] Verify RED.
- [ ] Add additive schema/migration fields and subscription snapshot fields.
- [ ] Implement service validation and branch price resolution.
- [ ] Implement the branch price matrix and conditional yes/no fields in the UI.
- [ ] Verify focused tests, Prisma validation, and typechecks.

### Task 4: Subscription operational branch

**Files:**
- Modify subscription DTO/service tests and production files under `backend/src/modules/club-subscriptions/`.
- Modify subscription form/model files under `frontend/src/pages/club/`.

**Interfaces:**
- Selection order is member, operational branch, package, authoritative price, dates/sessions, discount, payment.
- An operational branch is accepted only when it belongs to the member's canonical family and the actor can access it.
- Changing the branch clears an invalid package selection.

- [ ] Write failing sibling-allowed, outsider-denied, stale-package-cleared, and authoritative-price tests.
- [ ] Verify RED.
- [ ] Implement backend validation and snapshot creation.
- [ ] Implement filtered branch/package selectors and reset behavior.
- [ ] Verify focused tests and full typechecks.

### Task 5: Track verification

- [ ] Run all affected backend Jest suites.
- [ ] Run `npx prisma validate` without applying migrations.
- [ ] Run backend and frontend typechecks.
- [ ] Review the diff for numeric Tanta IDs, direct price trust, destructive SQL, or committed secrets.
- [ ] Write a handoff report including migration rehearsal prerequisites.
