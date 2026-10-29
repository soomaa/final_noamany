import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';

/**
 * Anti-escalation helpers shared by every endpoint that creates or edits a login
 * (users, users/admin, rbac/users). A non-system-admin holding `admin.users:*` or
 * `admin.roles:manage` may only manage staff logins inside their own branch scope,
 * and can never mint, promote or touch a system administrator.
 */

const ADMIN_TARGET_MESSAGE = 'لا يمكنك تعديل حساب مدير النظام';
const ADMIN_LEVEL_MESSAGE = 'منح صلاحية مدير النظام متاح لمدير النظام فقط';

type Store = Pick<PrismaService, 'users' | 'employees' | 'rbac_user_roles'>;

/** Reject granting legacy level 1 (system admin) by anyone who is not a system admin. */
export function assertCanGrantLevel(actor: JwtUser | undefined | null, level: number | null | undefined): void {
  if (level === 1 && !isSystemAdmin(actor)) throw new ForbiddenException(ADMIN_LEVEL_MESSAGE);
}

/** True if the user holds an active (non-expired) RBAC super-admin role — mirrors JwtStrategy. */
export async function hasActiveSuperAdminRole(prisma: Store, userId: number): Promise<boolean> {
  const now = new Date();
  const row = await prisma.rbac_user_roles.findFirst({
    where: {
      user_id: userId,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      role: { is_super_admin: true },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Branch of a login, resolved the same way the JWT does: the linked employee's
 * branch wins (users.emp_code stores employees.id), else users.branch_id_fk.
 */
export async function resolveUserBranch(
  prisma: Store,
  user: { emp_code: number | null; branch_id_fk: number | null },
): Promise<number | null> {
  if (user.emp_code != null) {
    const emp = await prisma.employees.findUnique({
      where: { id: user.emp_code },
      select: { branch_id_fk: true },
    });
    if (emp?.branch_id_fk != null) return emp.branch_id_fk;
  }
  return user.branch_id_fk ?? null;
}

/**
 * Throw 403 unless `actor` may manage the existing login `targetUserId`.
 * System admins are unrestricted. Everyone else is refused on level-1 / super-admin
 * targets and on targets whose branch is outside their scope.
 */
export async function assertCanManageUser(
  prisma: Store,
  scope: BranchScopeService,
  actor: JwtUser | undefined | null,
  targetUserId: number,
): Promise<void> {
  const target = await prisma.users.findUnique({
    where: { user_id: targetUserId },
    select: { user_id: true, level: true, emp_code: true, branch_id_fk: true },
  });
  if (!target) throw new NotFoundException('المستخدم غير موجود');
  if (isSystemAdmin(actor)) return;
  if (target.level === 1 || (await hasActiveSuperAdminRole(prisma, target.user_id))) {
    throw new ForbiddenException(ADMIN_TARGET_MESSAGE);
  }
  scope.assertBranchAllowed(actor, await resolveUserBranch(prisma, target));
}
