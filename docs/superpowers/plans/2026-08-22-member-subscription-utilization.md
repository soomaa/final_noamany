# Member Subscription Utilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subscription utilization to the existing member-attendance screen and allow attendance viewers to open the read-only member profile.

**Architecture:** A read-only attendance endpoint loads branch-scoped subscriptions and linked attendance, then delegates calculations to the existing profile-summary utility. The existing attendance page gains a third view and reuses `MemberProfileSheet`; no new route or page is introduced.

**Tech Stack:** NestJS, Prisma, Jest, React, TanStack Query/Table, Radix Tabs, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-22-member-subscription-utilization-design.md`

## Global Constraints

- No schema migration and no database write.
- Keep `/club/members/attendance` canonical.
- Preserve branch isolation and current attendance behavior.
- Reuse profile-summary calculation semantics.

---

### Task 1: Subscription utilization endpoint

**Files:**
- Create: `backend/src/modules/club-members/dto/subscription-utilization.dto.ts`
- Create: `backend/src/modules/club-members/club-attendance.subscription-utilization.spec.ts`
- Modify: `backend/src/modules/club-members/club-attendance.service.ts`
- Modify: `backend/src/modules/club-members/club-attendance.controller.ts`

**Interfaces:**
- Consumes: `buildMemberProfileSummary`, `JwtUser`, existing branch scope.
- Produces: `GET /club-attendance/subscription-utilization` returning `{ data, total, page, pageSize }`.

- [ ] Write a failing service test proving five visits do not subtract from calendar remaining days, linked sessions have their own remaining count, status filtering happens before pagination, and non-admin users are branch locked.
- [ ] Run `npm test -- club-attendance.subscription-utilization.spec.ts --runInBand` and confirm it fails because `subscriptionUtilization` does not exist.
- [ ] Add the DTO and minimal service/controller implementation using the existing profile-summary builder.
- [ ] Re-run the focused test and existing profile-summary/branch-scope tests.

### Task 2: Read-only profile permission

**Files:**
- Create: `backend/src/modules/club-members/club-members.profile-permission.spec.ts`
- Modify: `backend/src/modules/club-members/club-members.controller.ts`

**Interfaces:**
- Produces: profile-summary metadata accepting `club.members.attendance:view` in addition to current read permissions.

- [ ] Write a failing metadata test for the profile-summary handler.
- [ ] Run the focused test and verify the missing attendance permission failure.
- [ ] Add the method-level permission override without broadening other member endpoints.
- [ ] Re-run the focused test.

### Task 3: Existing attendance-page integration

**Files:**
- Modify: `frontend/src/pages/club/members.tsx`
- Modify: `frontend/src/components/club/member-profile-sheet.tsx`

**Interfaces:**
- Consumes: subscription-utilization paginated response.
- Produces: a third `استخدام الاشتراكات` view and reusable profile opening from a report row.

- [ ] Add typed utilization rows, query state, subscription-status filter, pagination, and columns.
- [ ] Hide attendance-only filters in utilization view and keep branch scope shared.
- [ ] Make member names open the existing profile sheet; narrow its input type to the profile header fields it actually needs.
- [ ] Run `npm run typecheck` and fix only feature-related failures.

### Task 4: Verification and design audit

**Files:**
- Verify only; no planned production changes.

- [ ] Run focused backend tests, backend build, frontend build, and Prisma validation.
- [ ] Exercise authenticated API requests for admin and branch-scoped users when local fixtures permit.
- [ ] Inspect `/club/members/attendance` at desktop and mobile widths, including empty/loading/error/profile states.
- [ ] Run Impeccable detector once over the changed frontend files and fix material findings.

