# Member Mobile Integrity Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make member creation, mobile login, branch data, packages, barcodes, subscriptions, and maintenance safe and consistent across ONE80, ONE80 Desktop, and Fitness Time.

**Architecture:** Use one branch-bound app identity per member, always created in the same transaction as the member with password `000000`. Resolve login through the member record rather than a global phone-first lookup; reject ambiguous legacy duplicate-phone data instead of choosing the wrong branch. Treat member code as the mobile/reception barcode, branch assignment as the package visibility source of truth, and require either a selected member or an explicit walk-in marker for subscriptions.

**Tech Stack:** NestJS, TypeScript, Prisma 5, MySQL, Jest, React/TypeScript, Electron bundle tooling.

**Spec:** Approved in-chat design from the 2026-08-25 diagnosis and the user's instruction to implement all fixes without further questions.

## Global Constraints

- New and imported members with usable phones receive a linked `api_users` row in the same logical operation.
- The default first-login password is exactly `000000`.
- Mobile login never silently selects the wrong branch for duplicate legacy phone data.
- The member barcode value is the full `member_code` and reception search accepts it.
- Every active package assigned to the member branch is returned regardless of `show_in_app`.
- A registered-member subscription cannot be saved without `member_id`; only an explicitly marked walk-in may remain unlinked.
- Password reset tools are dry-run by default, require confirmation, target linked member accounts only, and refuse employee-shared or broken references.
- No production database is changed while building or testing these local projects.

---

### Task 1: Shared member app-account lifecycle

**Files:**
- Create/modify in each backend: `src/modules/club-members/member-app-account.ts`
- Test: `src/modules/club-members/member-app-account.spec.ts`
- Modify: `src/modules/club-members/club-members.service.ts`

- [ ] Write failing lifecycle tests for fixed password, explicit linked-id reset scope, and automatic account creation.
- [ ] Run the focused Jest tests and confirm failure for missing behavior.
- [ ] Add the shared helper and make member creation always provision an account for every usable phone.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Branch-bound login and mobile responses

**Files:**
- Modify/test: `src/modules/member/member-auth.service.ts`
- Modify/test: `src/modules/member/member.service.ts`
- Modify: `src/common/types/member-jwt-user.ts`

- [ ] Write failing tests for branch-bound phone lookup, ambiguous legacy duplicates, full-code barcode, and all assigned branch packages.
- [ ] Confirm the tests fail for the current phone-first login, gate credential barcode, and `show_in_app` filter.
- [ ] Resolve the member before `api_users`, bind refresh tokens to member and branch, return `member_code` as barcode, and remove the editorial package filter.
- [ ] Confirm focused tests pass.

### Task 3: Subscription customer integrity

**Files:**
- Modify/test: `src/modules/club-subscriptions/club-subscriptions.service.ts`
- Modify: `src/modules/club-subscriptions/dto/upsert-club-subscription.dto.ts`
- Modify: relevant frontend subscription form types and payloads.

- [ ] Write failing tests that reject name-only subscriptions, accept explicit walk-ins, reject contradictory member/walk-in requests, and use the selected member as authoritative.
- [ ] Confirm failure, implement the validation/data normalization, then confirm focused tests pass.

### Task 4: Import, backfill, and reset safety

**Files:**
- Modify/create: `prisma/scripts/import-member-account-writer.ts`
- Modify: `prisma/scripts/import-customers.ts`
- Modify: `prisma/scripts/provision-member-app-accounts.ts`
- Modify: `prisma/scripts/reset-member-passwords.ts`
- Modify: `package.json`

- [ ] Add tests around account creation and reset target selection.
- [ ] Make imports create and link accounts, make backfill include all non-deleted members, and make reset dry-run/confirmed/member-only.
- [ ] Verify scripts compile and their dry-run help/guards work without a database write.

### Task 5: Fitness Time mobile module restoration

**Files:**
- Create: `src/modules/member/**`
- Modify/test: `src/app.module.ts`

- [ ] Write an AppModule metadata test that requires `MemberModule`.
- [ ] Confirm it fails, restore the member module/controllers/services/guards/strategy, and register it.
- [ ] Confirm module tests, member tests, and build pass.

### Task 6: Deployment copies and artifacts

**Files:**
- Synchronize the affected source/scripts into `one80-deploy` copies.
- Rebuild ONE80, ONE80 Desktop, and Fitness Time.
- Rebuild the Electron `server.cjs` bundle using the repository's existing packaging script.
- Create versioned deployment ZIPs with source, compiled output, safe maintenance scripts, and deployment instructions.

- [ ] Verify each canonical backend test suite and build.
- [ ] Verify deployment copies contain the same invariants with focused searches/tests.
- [ ] Inspect git diffs and generated ZIP contents against every global constraint.
