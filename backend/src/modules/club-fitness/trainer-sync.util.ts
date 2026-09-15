import { PrismaClient } from '@prisma/client';

type TrainerSyncPrisma = Pick<PrismaClient, 'employees' | 'department_jobs' | 'club_trainers'>;

const TRAINER_JOB_TITLES = new Set(['مدرب', 'مدرب لياقة', 'مدربة لياقة']);

function isTrainerJobTitle(title?: string | null): boolean {
  return TRAINER_JOB_TITLES.has(title?.trim() ?? '');
}

/**
 * Keep `club_trainers` in sync with employees whose job title (المسمى الوظيفي) is flagged
 * `is_trainer`. Keyed 1:1 on `club_trainers.employee_id`:
 *   - trainer job title + active employee → ensure an ACTIVE club_trainers row (create/reactivate,
 *     refreshing name/phone/email from the employee).
 *   - otherwise → DEACTIVATE (is_active=false) the auto-linked row — kept, not deleted, so class
 *     history and the FK stay intact.
 * Returns the affected club_trainers id, or null when nothing to do.
 */
export async function syncEmployeeTrainer(
  prisma: TrainerSyncPrisma,
  employeeId: number,
): Promise<number | null> {
  const emp = await prisma.employees.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      employee: true,
      phone: true,
      email: true,
      leave_emp: true,
      mosma_wazefy_code: true,
    },
  });
  if (!emp) return null;

  const job = emp.mosma_wazefy_code
    ? await prisma.department_jobs.findUnique({
        where: { id: emp.mosma_wazefy_code },
        select: { is_trainer: true, name: true },
      })
    : null;
  const jobIsTrainer = !!job?.is_trainer || isTrainerJobTitle(job?.name);
  // leave_emp null/0 = active employee (non-terminated), mirroring the HR "active" convention.
  const shouldBeTrainer = jobIsTrainer && (emp.leave_emp == null || emp.leave_emp === 0);

  const existing = await prisma.club_trainers.findUnique({ where: { employee_id: employeeId } });

  if (shouldBeTrainer) {
    const name = emp.employee?.trim() || `موظف #${employeeId}`;
    if (existing) {
      await prisma.club_trainers.update({
        where: { id: existing.id },
        data: {
          name,
          phone: emp.phone ?? existing.phone,
          email: emp.email ?? existing.email,
          is_active: true,
          is_deleted: false,
        },
      });
      return existing.id;
    }
    const created = await prisma.club_trainers.create({
      data: {
        employee_id: employeeId,
        name,
        phone: emp.phone ?? null,
        email: emp.email ?? null,
        is_active: true,
      },
    });
    return created.id;
  }

  // No longer a trainer → deactivate the auto-linked roster row (preserve it for history).
  if (existing && existing.is_active) {
    await prisma.club_trainers.update({
      where: { id: existing.id },
      data: { is_active: false },
    });
  }
  return existing?.id ?? null;
}

/**
 * Backfill: sync every employee holding a trainer job title, plus every employee already linked to
 * a club_trainers row (so de-flagging a job title deactivates its stale roster rows too).
 */
export async function syncAllEmployeeTrainers(prisma: TrainerSyncPrisma): Promise<number[]> {
  const empIds = new Set<number>();

  const trainerJobs = await prisma.department_jobs.findMany({
    where: { OR: [{ is_trainer: true }, { name: { in: [...TRAINER_JOB_TITLES] } }] },
    select: { id: true },
  });
  const jobIds = trainerJobs.map((j) => j.id);
  if (jobIds.length) {
    const emps = await prisma.employees.findMany({
      where: { mosma_wazefy_code: { in: jobIds } },
      select: { id: true },
    });
    emps.forEach((e) => empIds.add(e.id));
  }

  const linked = await prisma.club_trainers.findMany({
    where: { employee_id: { not: null } },
    select: { employee_id: true },
  });
  linked.forEach((l) => l.employee_id != null && empIds.add(l.employee_id));

  const synced: number[] = [];
  for (const id of empIds) {
    const trainerId = await syncEmployeeTrainer(prisma, id);
    if (trainerId != null) synced.push(trainerId);
  }
  return synced;
}
