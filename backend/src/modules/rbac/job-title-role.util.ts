import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const JOB_TITLE_ROLE_PREFIX = 'job_title_';

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
  return prisma.rbac_roles.upsert({
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
  await prisma.rbac_user_roles.deleteMany({ where: { user_id: user.user_id } });
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
