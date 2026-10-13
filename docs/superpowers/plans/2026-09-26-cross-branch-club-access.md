# Cross-Branch Club Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support configurable mutual member lookup, subscription sales, and barcode attendance for grouped branches while preserving each operation's branch identity.

**Architecture:** Persist branch groups and group memberships, then expose one backend resolver that expands an operating branch to its group. Club member lookup, subscription compatibility, and attendance use that resolver; the UI passes the selected branch without replacing it. Existing branch columns remain the reporting source of truth.

**Tech Stack:** NestJS 11, Prisma 5, MySQL 8, React/TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-26-cross-branch-club-access-design.md`

## Global Constraints

- `club_members.branch_id`, `club_subscriptions.branch_id`, and attendance branch fields retain their existing meanings.
- Cross-branch access is allowed only for active configured group siblings.
- The initial configuration covers exactly الجلاء and البر الشرقي in شبين الكوم.
- Search and barcode scan never change the selected branch in the UI or session.
- Preserve the current Tanta branch behavior and its tests.
- Write a failing test before each production change.

## Review Focus

- Exact member-code lookup at a sibling branch finds the member but leaves the transaction branch untouched.
- An unrelated branch cannot obtain a member through group lookup or attendance.
- A subscription's receipt/revenue stays on the selected transaction branch.
- A successful sibling check-in stores the physical scanning branch rather than the home branch.
- Group configuration missing one branch fails closed.

---

### Task 1: Persist and resolve branch groups

**Files:**
- Create: `backend/prisma/migrations/20260926120000_club_branch_groups/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/common/branch-groups/club-branch-group.service.ts`
- Create: `backend/src/common/branch-groups/club-branch-group.service.spec.ts`
- Modify: `backend/src/common/prisma/prisma.module.ts` or the owning common module

**Interfaces:**
- Produces: `ClubBranchGroupService.siblingBranchIds(branchId: number): Promise<number[]>` and `sharesGroup(leftBranchId: number, rightBranchId: number): Promise<boolean>`.

- [ ] **Step 1: Write failing resolver tests**

Cover two-member expansion, same-branch access, unrelated branches, and a group with fewer than two active members.

- [ ] **Step 2: Run resolver tests to verify RED**

Run: `node_modules/.bin/jest.cmd src/common/branch-groups/club-branch-group.service.spec.ts --runInBand`
Expected: FAIL because the service and group models do not exist.

- [ ] **Step 3: Add migration, Prisma models, and resolver**

Create group/member tables with unique group-branch membership; seed the Shebin El Kom pair by branch name only when both names exist. Resolver returns `[branchId]` for an ungrouped or invalid group.

- [ ] **Step 4: Run resolver tests and Prisma validation**

Run: `node_modules/.bin/jest.cmd src/common/branch-groups/club-branch-group.service.spec.ts --runInBand && npm run prisma:validate`
Expected: PASS and valid schema.

### Task 2: Apply grouped lookup and cross-branch subscription sale

**Files:**
- Modify: `backend/src/modules/club-members/club-members.service.ts:lookup`
- Modify: `backend/src/modules/club-subscriptions/club-subscriptions.service.ts`
- Modify: `backend/src/modules/club-members/club-branch-groups.ts`
- Modify/Create: focused club-member lookup and subscription tests

**Interfaces:**
- Consumes: Task 1 resolver.
- Produces: lookup results restricted to the selected branch group and a subscription compatibility decision based on group membership.

- [ ] **Step 1: Write failing service tests**

Assert a member from the sibling branch is returned from lookup, a third branch is excluded, and a subscription keeps its requested `branch_id` after accepting a sibling member.

- [ ] **Step 2: Run tests to verify RED**

Run the two focused Jest specs with `--runInBand`.
Expected: FAIL because lookup is global and compatibility is hard-coded for Tanta only.

- [ ] **Step 3: Replace hard-coded compatibility at the decision boundary**

Use the resolver to add a `branch_id in siblingBranchIds(selectedBranch)` lookup filter and to permit a member only when home and transaction branches share a group. Keep the existing Tanta behavior as an explicit compatibility path until it is represented by configured data.

- [ ] **Step 4: Run focused tests and legacy grouping tests**

Expected: all pass, including `club-branch-groups.spec.ts` and Tanta report specs.

### Task 3: Apply group eligibility at the attendance desk

**Files:**
- Modify: `backend/src/modules/club-members/club-attendance.service.ts`
- Modify/Create: `backend/src/modules/club-members/club-attendance.branch-scope.spec.ts`

**Interfaces:**
- Consumes: Task 1 resolver and existing active-subscription validation.
- Produces: cross-branch eligible lookup/check-in while attendance persists the scanning branch.

- [ ] **Step 1: Write failing attendance tests**

Cover a Galaa member at East, an East member at Galaa, and an unrelated branch rejection. Assert the stored attendance branch equals the desk branch.

- [ ] **Step 2: Run the attendance tests to verify RED**

Expected: sibling access is rejected by the member home-branch scope.

- [ ] **Step 3: Inject group resolver at member-scope checks**

Permit sibling identity only after normal staff operating-branch authorization and active-subscription validation; preserve the current attendance write branch.

- [ ] **Step 4: Run attendance and regression specs**

Expected: permitted and denied cases pass without changing legacy attendance behavior.

### Task 4: Make selected-versus-home branch explicit in the UI

**Files:**
- Modify: `frontend/src/components/club/member-search-combobox.tsx`
- Modify: the new-subscription page/component that consumes this picker
- Modify: `frontend/src/components/club/member-attendance-lookup.tsx`
- Test: relevant frontend component test or existing route test

**Interfaces:**
- Consumes: lookup response with home-branch label and selected operating branch.
- Produces: home-branch badges and a non-mutating transaction/attendance branch notice.

- [ ] **Step 1: Write failing UI behavior test**

Select a sibling member while Galaa remains chosen; assert the branch select value is unchanged and the issuance notice names both branches.

- [ ] **Step 2: Implement result badges and notices**

Never call the selected-branch setter from lookup result selection. Show the home branch in result cards and transaction/scan branch in the confirmation text.

- [ ] **Step 3: Run frontend tests and build**

Expected: component test passes and the frontend build completes.

### Task 5: Configure, seed, and verify the initial group

**Files:**
- Modify: `backend/prisma/seed/00-foundation.ts` or a dedicated seed module
- Modify: `backend/prisma/seed.ts` if a dedicated module is used
- Test: existing demo-seed verification path

**Interfaces:**
- Consumes: Task 1 group models and the exact two branch names.
- Produces: one active Shebin El Kom group with both branches in the local demo database.

- [ ] **Step 1: Add a failing seed integration assertion**

After a seed run, assert that the two named local branches share the same active group and that no other seeded branch is included.

- [ ] **Step 2: Seed the group from branch names**

Use queried branch IDs, not fixed IDs; preserve rerun idempotence.

- [ ] **Step 3: Run migration, seed, focused tests, and final verification**

Run migration, `SEED_OPERATIONAL_DEMO=true` seed, backend focused suites, frontend build/tests, Prisma validation, and a direct database check of group membership and zero orphan links.

## Self-review

- Task 1 owns configuration; Tasks 2–3 consume exactly its resolver; Task 4 keeps transaction selection UI-only; Task 5 validates both data and behavior.
- Reports retain their original branch columns, so no revenue, member-count, or attendance aggregation is silently changed.
- The only deliberate compatibility exception is the current Tanta helper, kept until configured legacy group data is introduced.
