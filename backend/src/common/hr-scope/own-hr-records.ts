import type { PermissionEngineService } from '../../modules/rbac/engine/permission-engine.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { JwtUser } from '../types/jwt-user';
import { isSystemAdmin } from '../utils/system-admin.util';

/** The legacy level of a branch manager account. */
const BRANCH_MANAGER_LEVEL = 3;

/**
 * Captain, reception, bar and sales accounts may file their own leaves and permits (view + create) but
 * not approve anybody's. In the HR lists they see only their own records (client, 20 Nov 2026: «حركات
 * الموظف صاحب الاكونت بس»). Admins, branch managers and anyone who can approve or reject the resource keep
 * the usual branch-scoped board.
 *
 * Returns null when the caller is unrestricted, otherwise the caller's own employee ids (both legacy
 * linkage conventions: users.emp_code may hold employees.id or employees.emp_code); [] when the account
 * is linked to no employee.
 */
export async function ownOnlyEmployeeIds(
  prisma: Pick<PrismaService, 'users' | 'employees'>,
  engine: Pick<PermissionEngineService, 'canAny'> | undefined,
  user: JwtUser | undefined | null,
  resourceKey: string,
): Promise<number[] | null> {
  if (!user || isSystemAdmin(user) || user.level === BRANCH_MANAGER_LEVEL) return null;
  if (!engine) return null;
  if (await engine.canAny(user.sub, [`${resourceKey}:approve`, `${resourceKey}:reject`])) return null;
  const account = await prisma.users.findUnique({ where: { user_id: user.sub }, select: { emp_code: true } });
  const code = account?.emp_code ?? user.emp_code ?? null;
  if (code == null) return [];
  const rows = await prisma.employees.findMany({
    where: { OR: [{ id: code }, { emp_code: code }] },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
