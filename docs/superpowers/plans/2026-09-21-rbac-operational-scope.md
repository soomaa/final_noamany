# RBAC Operational Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce branch-and-section access (`female`/`male`) for gender-specific operational data through the existing RBAC system and replace the legacy per-user permission editor.

**Architecture:** Keep role permissions and permission exceptions in the existing RBAC engine. Add a separate, auditable operational-scope assignment for a user's default section and a time-bounded cross-section exception. A server-side scope service supplies Prisma filters and ownership assertions; UI selection is only a convenience layer.

**Tech Stack:** NestJS, Prisma/MySQL, React/TypeScript, Jest, existing RBAC catalog and audit service.

**Spec:** `docs/superpowers/specs/2026-09-21-rbac-operational-scope-design.md`

## Global Constraints

- Gender-specific operational access is limited by branch and section; section values are exactly `female` and `male`.
- Shared data, including payment-method settings and shared legal/configuration data, is protected by its page/action permission and is not gender-filtered.
- A cross-section grant is individual, auditable, reasoned, and optionally expires.
- Deny wins over allow; system administrators keep their existing bypass.
- Never use client-side filtering as authorization.
- External email/SMS/WhatsApp and server backups are not part of this implementation.

## Review Focus

- Expired cross-section grants must stop access without a restart; cover in Task 2.
- A request with no branch/section filter must still be constrained server-side; cover in Task 2.
- A detail/update URL for a record in the other section must not bypass a list filter; cover in Task 2.
- A legacy permissions PUT must not create an alternate allow path; cover in Task 4.
- A role or scope change must invalidate cached access immediately; cover in Tasks 2 and 3.

---

## File structure

- `backend/prisma/schema.prisma`: persistent operational scope and exception tables.
- `backend/src/modules/rbac/engine/operational-scope.service.ts`: resolves effective scope, creates branch/section filters, and asserts record scope.
- `backend/src/modules/rbac/engine/operational-scope.service.spec.ts`: resolver and expiry tests.
- `backend/src/modules/rbac/admin/dto/operational-scope.dto.ts`: validated admin requests.
- `backend/src/modules/rbac/admin/rbac-users.service.ts` and controller: scope administration and audit events.
- `backend/src/modules/rbac/admin/*spec.ts`: authorization and audit regression tests.
- `frontend/src/hooks/use-rbac.ts`, `frontend/src/types/rbac.ts`, `frontend/src/pages/admin/roles.tsx`, `frontend/src/pages/admin/exceptions.tsx`: role assignment and scope/exception interface.
- `frontend/src/pages/users/manage.tsx`: remove legacy checkboxes and link to RBAC access management.
- Sensitive controllers listed in Task 4: explicit catalog permissions.

### Task 1: Persist staff operating scopes

**Files:**
- Modify: `backend/prisma/schema.prisma:1341-1368, 7729-7792`
- Create: `backend/prisma/migrations/<timestamp>_add_rbac_operational_scopes/migration.sql`
- Test: `backend/src/modules/rbac/engine/operational-scope.service.spec.ts`

**Produces:** `RbacOperationalSection = 'female' | 'male'`; `rbac_user_operational_scopes` (default branch/section assignments); `rbac_user_section_exceptions` (additional section, reason, expiry, actor).

- [ ] **Step 1: Write failing persistence tests**

```ts
it('rejects a duplicate active default scope for the same user and branch', async () => {
  await expect(saveDefaultScope({ userId: 12, branchId: 3, section: 'female' }))
    .resolves.toBeDefined();
  await expect(saveDefaultScope({ userId: 12, branchId: 3, section: 'female' }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend; npm test -- operational-scope.service.spec.ts`

Expected: FAIL because scope persistence does not exist.

- [ ] **Step 3: Add Prisma models and migration**

```prisma
enum RbacOperationalSection { female male }
model rbac_user_operational_scopes {
  id Int @id @default(autoincrement())
  user_id Int
  branch_id Int
  section RbacOperationalSection
  created_at DateTime @default(now())
  created_by Int?
  @@unique([user_id, branch_id, section])
  @@index([user_id, branch_id])
}
```

Create the matching SQL migration with the same unique index and a foreign-key-free convention consistent with the existing `users`/branch columns.

- [ ] **Step 4: Generate Prisma client and rerun the focused test**

Run: `cd backend; npx prisma generate; npm test -- operational-scope.service.spec.ts`

Expected: PASS.

### Task 2: Resolve and enforce effective operational scope

**Files:**
- Create: `backend/src/modules/rbac/engine/operational-scope.service.ts`
- Create: `backend/src/modules/rbac/engine/operational-scope.service.spec.ts`
- Modify: `backend/src/modules/rbac/rbac.module.ts`

**Consumes:** `PermissionEngineService.isSuperAdmin(userId)` and Task 1 tables.

**Produces:**

```ts
type EffectiveOperationalScope = { all: boolean; branches: Map<number, Set<'female' | 'male'>> };
resolve(userId: number, now?: Date): Promise<EffectiveOperationalScope>;
assertMemberAccess(userId: number, memberId: number): Promise<void>;
memberWhere(scope: EffectiveOperationalScope): Prisma.club_membersWhereInput;
```

- [ ] **Step 1: Write failing resolver tests**

```ts
it('filters a female staff member to her own branch and section', async () => {
  prisma.rbac_user_operational_scopes.findMany.mockResolvedValue([{ branch_id: 3, section: 'female' }]);
  expect(await service.resolve(12)).toEqual({ all: false, branches: new Map([[3, new Set(['female'])]]) });
});
it('ignores an expired cross-section exception', async () => {
  prisma.rbac_user_section_exceptions.findMany.mockResolvedValue([{ branch_id: 3, section: 'male', expires_at: new Date('2026-01-01') }]);
  expect((await service.resolve(12, new Date('2026-09-21'))).branches.get(3)).not.toContain('male');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend; npm test -- operational-scope.service.spec.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement resolver and server-side member guards**

Use `users.branch_id_fk` only as fallback for branch assignment; a missing section returns an empty scope. Query active exceptions using `expires_at: null OR expires_at > now`. `memberWhere` must emit `OR` pairs of `{ branch_id, gender }`, never an unrestricted filter for a non-admin. `assertMemberAccess` must load the member and compare branch and `ClubGender` before returning it.

- [ ] **Step 4: Apply the service to every club member list, detail, mutation, aggregate, and CSV export path**

Start with the service/controller pair serving `club_members`, then follow its member relations (subscriptions, attendance, receipts, refunds, lockers, bookings) so each lookup calls `assertMemberAccess` and each list uses the scoped `where`. Do not apply this filter to shared settings/catalogs; their controller permission is the access boundary. Add a regression test for each route family before changing it.

- [ ] **Step 5: Run focused tests**

Run: `cd backend; npm test -- operational-scope.service.spec.ts; npm run typecheck`

Expected: PASS.

### Task 3: Administer roles, assigned section, and individual exceptions

**Files:**
- Create: `backend/src/modules/rbac/admin/dto/operational-scope.dto.ts`
- Modify: `backend/src/modules/rbac/admin/rbac-users.controller.ts`, `rbac-users.service.ts`, `audit.service.ts`, `frontend/src/types/rbac.ts`, `frontend/src/hooks/use-rbac.ts`, `frontend/src/pages/admin/roles.tsx`, `frontend/src/pages/admin/exceptions.tsx`
- Test: `backend/src/modules/rbac/admin/rbac-users.service.spec.ts`

**Produces:** `PUT /rbac/users/:id/operational-scope` and `PUT/DELETE /rbac/users/:id/section-exception`, guarded by `admin.roles:manage` and `admin.exceptions:manage` respectively.

- [ ] **Step 1: Write failing admin-service tests**

```ts
it('writes a reasoned cross-section exception and invalidates the target cache', async () => {
  await service.setSectionException(12, { branchId: 3, section: 'male', reason: 'مدير الفرع', expiresAt: null }, 1);
  expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'scope.exception.update', targetId: '12' }));
  expect(engine.invalidateUser).toHaveBeenCalledWith(12);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend; npm test -- rbac-users.service.spec.ts`

Expected: FAIL because the scope APIs do not exist.

- [ ] **Step 3: Implement DTO validation, service methods, audit, and UI**

Require `branchId`, `section`, and `reason` for a cross-section exception. In the UI, show assigned branch/section separately from “both sections by exception”, display expiry, and require confirmation before revoke. Reuse the existing role list/matrix API and expose existing create/update/clone/delete role operations instead of adding a second role store.

- [ ] **Step 4: Run tests and frontend typecheck**

Run: `cd backend; npm test -- rbac-users.service.spec.ts; npm run typecheck; cd ../frontend; npm run typecheck`

Expected: PASS.

### Task 4: Eliminate the legacy permission path and protect sensitive endpoints

**Files:**
- Modify: `frontend/src/pages/users/manage.tsx`, `backend/src/modules/users/users.controller.ts`, `backend/src/modules/users/users.service.ts`
- Modify: `backend/src/modules/activities/activities.controller.ts`, `customer-service/customer-service.controller.ts`, `daily-reports/daily-reports.controller.ts`, `initiatives/initiatives.controller.ts`, `legal-files/legal-files.controller.ts`, `payment-methods/payment-methods.controller.ts`, `backend/src/modules/rbac/catalog/rbac.catalog.ts`
- Test: `backend/src/modules/rbac/critical-mutation-permissions.spec.ts`

- [ ] **Step 1: Write failing authorization regression tests**

```ts
it.each(['activities', 'customer-service', 'hr/daily-reports', 'initiatives', 'legal-files', 'payment-methods'])
('requires a catalog permission for %s mutations', (route) => {
  expect(controllerMetadata(route)).toContain('RequiresPermission');
});
it('does not expose a legacy PUT user permissions mutation', () => {
  expect(usersControllerRoutes()).not.toContain('PUT /users/:id/permissions');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend; npm test -- critical-mutation-permissions.spec.ts`

Expected: FAIL for currently authentication-only controllers and legacy PUT.

- [ ] **Step 3: Apply explicit permissions and remove legacy editor**

Add `@RequiresPermission('<catalog-resource>:view|create|update|delete')` per endpoint action; add a payment-method resource to the catalog if absent. Remove the checkbox dialog and the legacy PUT endpoint. Keep a read-only migration response only if another deployed client still calls GET; it must return RBAC-derived access, not `permissions` table rows.

- [ ] **Step 4: Run security and type checks**

Run: `cd backend; npm test -- critical-mutation-permissions.spec.ts; npm run typecheck; cd ../frontend; npm run typecheck`

Expected: PASS.

### Task 5: End-to-end verification and safe rollout

**Files:**
- Modify: `backend/prisma/test-engine.ts`
- Create: `docs/rbac-operational-scope-rollout.md`

- [ ] **Step 1: Add acceptance cases**

Add fixtures for a female-branch employee, male same-branch member, female same-branch member, active both-sections exception, expired exception, and super-admin. Assert list, detail, update, aggregate, and export outcomes.

- [ ] **Step 2: Run full relevant verification**

Run: `cd backend; npx ts-node prisma/test-engine.ts; npm test -- --runInBand; npm run typecheck; cd ../frontend; npm run typecheck`

Expected: all commands exit 0.

- [ ] **Step 3: Write rollout procedure**

Document: snapshot database, run migration in staging, assign every active user a branch/section, review the unassigned-user report, validate female/male test accounts, deploy, then remove legacy permission writes. Include rollback as disabling scope enforcement before reverting the migration; do not delete RBAC audit data.
