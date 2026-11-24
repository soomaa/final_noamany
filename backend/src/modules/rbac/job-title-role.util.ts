import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { branchManagerHrCells, defaultPermissionCellsForJobTitle, isBranchManagerSheetTitle } from './job-title-defaults';

export const JOB_TITLE_ROLE_PREFIX = 'job_title_';

/**
 * «إدارة المبيعات (إضافية)»: added on top of any role by the per-user «يعمل كأخصائي مبيعات»
 * toggle (user exceptions). Never a job-title role, so a job-title change keeps it.
 */
export const ADDITIONAL_SALES_ROLE_KEY = 'additional_sales';

export function jobTitleRoleKey(jobTitleId: number): string {
  return `${JOB_TITLE_ROLE_PREFIX}${jobTitleId}`;
}

export function isJobTitleRoleKey(key: string): boolean {
  return key.startsWith(JOB_TITLE_ROLE_PREFIX);
}

type PrismaLike = Pick<PrismaClient, 'department_jobs' | 'rbac_roles' | 'rbac_user_roles'>;

/** Ensure every job title has a matching RBAC role (1:1 by stable key). */
export async function syncAllJobTitleRoles(prisma: PrismaLike) {
  const jobs = await prisma.department_jobs.findMany({ orderBy: [{ id: 'asc' }] });
  for (const job of jobs) {
    await ensureRoleForJobTitle(prisma, job);
  }
}

export async function ensureRoleForJobTitle(
  prisma: PrismaLike,
  job: { id: number; name: string },
) {
  const key = jobTitleRoleKey(job.id);
  const role = await prisma.rbac_roles.upsert({
    where: { key },
    create: {
      key,
      name_ar: job.name,
      name_en: job.name,
      description: `صلاحيات المسمى الوظيفي: ${job.name}`,
      is_system: true,
    },
    update: {
      name_ar: job.name,
      name_en: job.name,
      description: `صلاحيات المسمى الوظيفي: ${job.name}`,
    },
  });
  await applyStarterPermissionsIfEmpty(prisma, role.id, job.name);
  return role;
}

type StarterPrisma = Partial<Pick<PrismaClient, 'rbac_role_permissions' | 'rbac_resources' | 'rbac_actions'>>;

/**
 * Give a job-title role its starter matrix (reception, captain, …) only while it has no
 * permissions at all. A matrix an administrator already edited is never touched.
 */
export async function applyStarterPermissionsIfEmpty(prisma: object, roleId: number, jobName: string) {
  const db = prisma as StarterPrisma;
  if (!db.rbac_role_permissions || !db.rbac_resources || !db.rbac_actions) return;
  const cells = defaultPermissionCellsForJobTitle(jobName);
  if (!cells.length) return;
  if ((await db.rbac_role_permissions.count({ where: { role_id: roleId } })) > 0) return;
  const [resources, actions] = await Promise.all([
    db.rbac_resources.findMany({ where: { key: { in: [...new Set(cells.map((c) => c.resourceKey))] } }, select: { id: true, key: true } }),
    db.rbac_actions.findMany({ where: { key: { in: [...new Set(cells.map((c) => c.actionKey))] } }, select: { id: true, key: true } }),
  ]);
  const resourceId = new Map(resources.map((r) => [r.key, r.id] as const));
  const actionId = new Map(actions.map((a) => [a.key, a.id] as const));
  const data = cells
    .filter((c) => resourceId.has(c.resourceKey) && actionId.has(c.actionKey))
    .map((c) => ({ role_id: roleId, resource_id: resourceId.get(c.resourceKey)!, action_id: actionId.get(c.actionKey)!, effect: c.effect }));
  if (data.length) await db.rbac_role_permissions.createMany({ data, skipDuplicates: true });
}

export async function removeRoleForJobTitle(prisma: PrismaLike, jobTitleId: number) {
  const key = jobTitleRoleKey(jobTitleId);
  const role = await prisma.rbac_roles.findUnique({ where: { key } });
  if (!role) return;
  const users = await prisma.rbac_user_roles.count({ where: { role_id: role.id } });
  if (users > 0) {
    throw new BadRequestException(
      `لا يمكن حذف المسمى — ${users} مستخدم مرتبط بصلاحيات هذا الدور`,
    );
  }
  await prisma.rbac_roles.delete({ where: { id: role.id } });
}

type EmployeeUserPrisma = PrismaLike & Pick<PrismaClient, 'employees' | 'users'>;

/** Resolve the RBAC role id for a job-title id (creates the role row if missing). */
export async function resolveRoleIdForJobTitleId(prisma: PrismaLike, jobTitleId: number): Promise<number> {
  const job = await prisma.department_jobs.findUnique({ where: { id: jobTitleId } });
  if (!job) throw new BadRequestException('المسمى الوظيفي غير موجود');
  // Every job title owns exactly one visible role. Trainers used to be redirected
  // to a hidden shared `trainer` role, so editing the "مدرب" job-title matrix did
  // not affect the actual trainer account (especially obvious on revocation).
  const role = await ensureRoleForJobTitle(prisma, job);
  return role.id;
}

/**
 * Align a login user's RBAC role with the employee's current job title.
 * No-op when the employee has no job title or no linked login account.
 */
export async function syncEmployeeUserRole(prisma: EmployeeUserPrisma, employeeId: number): Promise<number | null> {
  const emp = await prisma.employees.findUnique({
    where: { id: employeeId },
    select: { mosma_wazefy_code: true },
  });
  const jobTitleId = emp?.mosma_wazefy_code;
  if (!jobTitleId) return null;

  const user = await prisma.users.findFirst({
    where: { emp_code: employeeId },
    select: { user_id: true },
  });
  if (!user) return null;

  const roleId = await resolveRoleIdForJobTitleId(prisma, jobTitleId);
  await prisma.users.update({ where: { user_id: user.user_id }, data: { role_id_fk: roleId } });
  // The «also sells» role is per user, not per job title: a job-title change keeps it.
  await prisma.rbac_user_roles.deleteMany({
    where: { user_id: user.user_id, NOT: { role: { key: ADDITIONAL_SALES_ROLE_KEY } } },
  });
  await prisma.rbac_user_roles.create({ data: { user_id: user.user_id, role_id: roleId } });
  return user.user_id;
}

/** Backfill: every employee with a job title + login account gets the matching job-title role. */
export async function syncAllEmployeeUserRoles(prisma: EmployeeUserPrisma): Promise<number[]> {
  const employees = await prisma.employees.findMany({
    where: { mosma_wazefy_code: { not: null } },
    select: { id: true },
  });
  const synced: number[] = [];
  for (const emp of employees) {
    const userId = await syncEmployeeUserRole(prisma, emp.id);
    if (userId != null) synced.push(userId);
  }
  return synced;
}

type BackfillPrisma = Pick<PrismaClient, 'rbac_roles' | 'rbac_role_permissions' | 'rbac_resources' | 'rbac_actions'>;

/**
 * One-off (re-runnable) backfill of the 24 Nov branch-manager HR cells onto EXISTING branch-manager
 * job-title roles. Only adds missing cells (createMany skipDuplicates on the role/resource/action
 * unique key): custom grants, and any explicit Deny an admin already stored, are left untouched.
 * Script: prisma/scripts/apply-branch-manager-hr-defaults.ts. Do not run it on every boot — that
 * would re-add cells an admin removed on purpose.
 */
export async function applyBranchManagerHrDefaults(prisma: BackfillPrisma) {
  const cells = branchManagerHrCells();
  const [roles, resources, actions] = await Promise.all([
    prisma.rbac_roles.findMany({ where: { key: { startsWith: JOB_TITLE_ROLE_PREFIX } }, select: { id: true, name_ar: true } }),
    prisma.rbac_resources.findMany({ where: { key: { in: [...new Set(cells.map((c) => c.resourceKey))] } }, select: { id: true, key: true } }),
    prisma.rbac_actions.findMany({ where: { key: { in: [...new Set(cells.map((c) => c.actionKey))] } }, select: { id: true, key: true } }),
  ]);
  const resourceId = new Map(resources.map((r) => [r.key, r.id] as const));
  const actionId = new Map(actions.map((a) => [a.key, a.id] as const));
  const missingResources = [...new Set(cells.map((c) => c.resourceKey))].filter((k) => !resourceId.has(k));
  const targets = roles.filter((r) => isBranchManagerSheetTitle(r.name_ar));
  let added = 0;
  for (const role of targets) {
    const data = cells
      .filter((c) => resourceId.has(c.resourceKey) && actionId.has(c.actionKey))
      .map((c) => ({ role_id: role.id, resource_id: resourceId.get(c.resourceKey)!, action_id: actionId.get(c.actionKey)!, effect: c.effect }));
    if (!data.length) continue;
    const result = await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
    added += result.count;
  }
  return { roles: targets.map((r) => ({ id: r.id, name: r.name_ar })), added, missingResources };
}
