# Gym branch and cashier isolation

This implementation is intentionally reusable across gym deployments. Keep these rules together;
do not replace them with UI-only filtering.

## Security rules

1. System admin (`users.level = 1`) may view all branches and all cashiers.
2. Attendance is operationally locked to the signed-in user's exact branch. Admin may select all or
   one branch.
3. A subscription type is available only when `apply_to_all_branches = 1`, its legacy `branch_id`
   matches, or it has an explicit row in `club_subscription_type_branches`.
4. Plan conversion validates the target plan against the source subscription branch on the server.
5. Non-admin treasury and finance queries always include `created_by = JWT.sub`; admin is
   unrestricted.
6. Walk-in ID/session sales are found through `club_receipts.branch_id`, even when `member_id` and
   `subscription_id` are null.
7. Frontend query cache is cleared on login, logout, and POS-user switching so one cashier never
   sees another cashier's cached data.
8. The global `BranchScopeGuard` inspects `req.query` and `req.body` only. A route that takes the
   branch as a **path param** (`@Param('branchId')`) is NOT covered by it — such a route must take
   `@CurrentUser()` and assert the branch in its service.
9. A write keyed only by row id (`update`/`remove` by `:id`) never reaches the guard either. Gate it
   by loading the row first and asserting `isBranchAllowed` on the row's own `branch_id` — usually
   by routing the write through a branch-checked `findOne(id, user)`.

## Reusable code

- Backend branch scope: `backend/src/common/branch-scope/branch-scope.service.ts`
- Attendance exact-branch rule: `backend/src/modules/club-members/club-attendance.service.ts`
- Plan assignment helpers: `backend/src/modules/club-subscriptions/subscription-type-branch-scope.ts`
- Finance creator scope: `backend/src/modules/finance/finance-user-scope.ts`
- Path-param and id-keyed write guards: `backend/src/modules/inventory/product-branches.service.ts`,
  `backend/src/modules/inventory/opening-stocks.service.ts` (tests:
  `backend/src/modules/inventory/inventory.branch-scope.spec.ts`)
- Frontend plan helper: `frontend/src/lib/club-subscription-branches.ts`
- Auth cache boundary: `frontend/src/store/auth.ts`

## New gym rollout checklist

1. Assign a real `branch` to every non-admin user. Unassigned users fail closed.
2. Assign every subscription type to one or more branches, or explicitly mark it as available to
   all branches. Legacy null/unassigned plans are intentionally hidden from reception.
3. Set `branch_id` and `created_by` on every cash-producing write, especially walk-in receipts.
4. Keep level-1 admin accounts for cross-branch administration; do not give reception accounts
   level 1.
5. Run:

   ```bash
   cd backend && npm run typecheck && npm test -- --runInBand && npm run build
   cd ../frontend && npm run typecheck && npm run build
   ```

6. Smoke-test with three accounts: admin, branch A reception, and branch B reception. Verify both
   reception accounts cannot retrieve the other branch through edited query/body parameters, edited
   **URL path segments**, or a write aimed at another branch's row id.

