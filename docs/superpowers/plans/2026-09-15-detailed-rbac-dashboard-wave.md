# Detailed RBAC and Employee Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Do not change Prisma schema or migration files in this track.

**Goal:** Make modern RBAC the visible, enforceable permission system and generate an employee dashboard grouped by department.

**Architecture:** Job roles provide permission baselines and per-user allow/deny exceptions produce effective permissions. One catalog supplies department order, page order, actions, navigation, route guards, search, and dashboard cards.

**Tech Stack:** NestJS 11, existing Prisma RBAC models, React 18, TypeScript, Jest, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-15-platform-modernization.md`

## Global Constraints

- Do not modify `backend/prisma/schema.prisma` or any migration.
- Use existing `rbac_user_roles`, `rbac_role_permissions`, and `rbac_user_exceptions`.
- A deny exception wins over a role allow; an allow exception can grant an action absent from the role baseline.
- A page without effective view permission must not appear in sidebar, search, dashboard, or pass its route/API guard.
- Prevent non-system administrators from granting permissions they do not own.
- Use red-green-refactor for every behavior change.

---

### Task 1: Canonical permission catalog

**Files:**
- Modify catalog and engine files under `backend/src/modules/rbac/`.
- Modify matching types/catalog files under `frontend/src/`.
- Add focused unit tests.

**Interfaces:**
- Each page entry has department key/label/order, page key/label/order, route, and supported actions.
- Supported actions are view, create, update, delete, approve, reject, export, and print as applicable.

- [ ] Write failing tests for stable department/page ordering and unique page/action keys.
- [ ] Verify RED.
- [ ] Implement or normalize the shared catalog contract.
- [ ] Verify focused tests and typechecks.

### Task 2: Effective per-user permission API

**Files:**
- Modify services/controllers under `backend/src/modules/rbac/`, `backend/src/modules/users/`, or `backend/src/modules/user-admin/` as appropriate.
- Add focused Jest tests.

**Interfaces:**
- Read endpoint returns role baseline, per-user exceptions, and effective action state for every catalog page.
- Write endpoint replaces only the selected user's exceptions and emits an audit record/cache invalidation.

- [ ] Write failing precedence, anti-escalation, atomic replacement, and cache invalidation tests.
- [ ] Verify RED.
- [ ] Implement minimal read/write behavior using existing RBAC tables.
- [ ] Verify focused tests and backend typecheck.

### Task 3: Department-grouped permissions screen

**Files:**
- Modify: `frontend/src/pages/users/manage.tsx`
- Modify or replace: `frontend/src/pages/users/permissions.tsx`
- Add focused pure-model tests beside the page or under `frontend/tests/`.

**Interfaces:**
- Clicking permissions for a user opens grouped departments in configured order.
- Every page shows only its supported action toggles and clearly distinguishes inherited, explicit allow, and explicit deny.

- [ ] Write failing grouping, ordering, tri-state, and payload tests.
- [ ] Verify RED.
- [ ] Implement the grouped screen and save flow.
- [ ] Verify focused tests and frontend typecheck.

### Task 4: Unified navigation and employee dashboard

**Files:**
- Modify sidebar, topbar search, route permission, and dashboard model files under `frontend/src/`.
- Modify: `backend/src/modules/workspace/workspace-widgets.service.ts` or its actual equivalent.
- Add focused backend/frontend tests.

**Interfaces:**
- Sidebar, search, routes, and dashboard consume effective permissions from the same source.
- Dashboard groups accessible page cards by department and catalog order; no hard-coded reception/member/subscription quick links remain.

- [ ] Write failing consistency and grouped-dashboard tests.
- [ ] Verify RED.
- [ ] Implement effective-permission navigation and generated widgets.
- [ ] Verify focused tests and both typechecks.

### Task 5: Track verification

- [ ] Run all affected RBAC/user/workspace Jest suites.
- [ ] Run frontend model tests and typecheck.
- [ ] Search for remaining production use of legacy `/me/menu` and document any compatibility-only path.
- [ ] Review for privilege escalation, hidden-route access, stale caches, and committed secrets.
- [ ] Write a handoff report with changed files and verification evidence.
