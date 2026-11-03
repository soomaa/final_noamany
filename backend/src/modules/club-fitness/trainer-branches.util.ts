/**
 * Which branches a trainer belongs to.
 *
 * `club_trainers` has no branch column. A trainer linked to an employee belongs to the
 * employee's branch (HR is authoritative). A trainer with no employee link (external
 * captains, manually added coaches) belongs to every branch where they actually work:
 * their weekly schedule slots, their classes and the private subscriptions they coach.
 * A trainer with no evidence at all has an empty list: it has no classes and no private
 * subscriptions, so it has no earnings either, and branch-scoped users may still see it
 * (to assign it to a class or a target) without being able to pay anything.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function trainerBranchMap(db: Db, trainerIds?: number[]): Promise<Map<number, number[]>> {
  const idFilter = trainerIds ? { in: trainerIds } : undefined;
  const trainers: Array<{ id: number; employee_id: number | null }> = await db.club_trainers.findMany({
    where: { is_deleted: false, ...(idFilter ? { id: idFilter } : {}) },
    select: { id: true, employee_id: true },
  });
  const result = new Map<number, Set<number>>(trainers.map((row) => [row.id, new Set<number>()]));
  if (!trainers.length) return new Map();

  const employeeIds = trainers.map((row) => row.employee_id).filter((id): id is number => id != null);
  const employees: Array<{ id: number; branch_id_fk: number | null }> = employeeIds.length
    ? await db.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, branch_id_fk: true } })
    : [];
  const employeeBranch = new Map(employees.map((row) => [row.id, Number(row.branch_id_fk ?? 0)]));
  const needEvidence: number[] = [];
  for (const trainer of trainers) {
    const branch = trainer.employee_id != null ? employeeBranch.get(trainer.employee_id) ?? 0 : 0;
    if (branch > 0) result.get(trainer.id)!.add(branch);
    else needEvidence.push(trainer.id);
  }

  if (needEvidence.length) {
    const [slots, classes, privateSubs] = await Promise.all([
      db.club_trainer_schedule_slots.groupBy({
        by: ['trainer_id', 'branch_id'],
        where: { trainer_id: { in: needEvidence } },
      }),
      db.club_classes.groupBy({
        by: ['trainer_id', 'branch_id'],
        where: { trainer_id: { in: needEvidence }, is_deleted: false },
      }),
      db.club_subscriptions.groupBy({
        by: ['private_trainer_id', 'branch_id'],
        where: { private_trainer_id: { in: needEvidence } },
      }),
    ]);
    for (const row of [...slots, ...classes]) result.get(row.trainer_id)?.add(Number(row.branch_id));
    for (const row of privateSubs) result.get(row.private_trainer_id)?.add(Number(row.branch_id));
  }

  return new Map([...result.entries()].map(([id, set]) => [id, [...set].filter((b) => b > 0).sort((a, b) => a - b)]));
}

/** Trainers a branch-scoped user may see: any branch in common, or no branch known yet. */
export function trainersVisibleInBranches(map: Map<number, number[]>, allowed: number[]): number[] {
  return [...map.entries()]
    .filter(([, branches]) => !branches.length || branches.some((branch) => allowed.includes(branch)))
    .map(([id]) => id);
}
