import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

/**
 * Employee-level branch isolation helpers shared by the HR modules (loans, rewards,
 * penalties, tasks, custody, daily reports, …) whose rows reference an employee rather
 * than a branch. An employee belongs to `employees.branch_id_fk`; a scoped user may only
 * touch employees in `BranchScopeService.allowedBranchIds(user)`. The user's own employee
 * row (`user.emp_code` = employees.id) is always in scope so self-service keeps working.
 *
 * `null` results mean "unrestricted" (system admin) — callers must not add a filter.
 */
type EmployeeReader = Pick<PrismaService, 'employees'>;

export const OUT_OF_SCOPE_EMPLOYEE_MESSAGE = 'لا تملك صلاحية الوصول لبيانات موظف من فرع آخر';

export interface ScopedEmployees {
  /** employees.id values in scope. */
  ids: number[];
  /** employees.emp_code values in scope (business key used by some legacy tables). */
  codes: number[];
}

/** In-scope employees for a list filter, or `null` when the user is unrestricted. */
export async function scopedEmployees(
  prisma: EmployeeReader,
  scope: BranchScopeService,
  user: JwtUser | undefined | null,
): Promise<ScopedEmployees | null> {
  const allowed = scope.allowedBranchIds(user);
  if (allowed === null) return null;
  const ownId = user?.emp_code != null ? Number(user.emp_code) : null;
  const rows = await prisma.employees.findMany({
    where: {
      OR: [
        ...(allowed.length ? [{ branch_id_fk: { in: allowed } }] : []),
        ...(ownId ? [{ id: ownId }] : []),
      ],
    },
    select: { id: true, emp_code: true },
  });
  return {
    ids: rows.map((r) => r.id),
    codes: rows.map((r) => r.emp_code).filter((c): c is number => c != null),
  };
}

/** Convenience: in-scope employees.id list (null = unrestricted). */
export async function scopedEmployeeIds(
  prisma: EmployeeReader,
  scope: BranchScopeService,
  user: JwtUser | undefined | null,
): Promise<number[] | null> {
  const scoped = await scopedEmployees(prisma, scope, user);
  return scoped ? scoped.ids : null;
}

/**
 * Throw 403 unless every employee id is in the user's scope. Missing employees and
 * null ids are treated as foreign for scoped users (fail closed).
 */
export async function assertEmployeesInScope(
  prisma: EmployeeReader,
  scope: BranchScopeService,
  user: JwtUser | undefined | null,
  empIds: Array<number | null | undefined>,
  message = OUT_OF_SCOPE_EMPLOYEE_MESSAGE,
): Promise<void> {
  const allowed = scope.allowedBranchIds(user);
  if (allowed === null) return;
  const ownId = user?.emp_code != null ? Number(user.emp_code) : null;
  const ids = [...new Set(empIds.map((id) => (id == null ? NaN : Number(id))))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new ForbiddenException(message);
  const toCheck = ids.filter((id) => id !== ownId);
  if (!toCheck.length) return;
  const rows = await prisma.employees.findMany({
    where: { id: { in: toCheck } },
    select: { id: true, branch_id_fk: true },
  });
  if (rows.length !== toCheck.length) throw new ForbiddenException(message);
  for (const row of rows) {
    if (row.branch_id_fk == null || !allowed.includes(Number(row.branch_id_fk))) {
      throw new ForbiddenException(message);
    }
  }
}

/** Single-employee variant of {@link assertEmployeesInScope}. */
export function assertEmployeeInScope(
  prisma: EmployeeReader,
  scope: BranchScopeService,
  user: JwtUser | undefined | null,
  empId: number | null | undefined,
  message = OUT_OF_SCOPE_EMPLOYEE_MESSAGE,
): Promise<void> {
  return assertEmployeesInScope(prisma, scope, user, [empId], message);
}

/** Same as {@link assertEmployeesInScope} but keyed by the employees.emp_code business key. */
export async function assertEmployeeCodesInScope(
  prisma: EmployeeReader,
  scope: BranchScopeService,
  user: JwtUser | undefined | null,
  empCodes: Array<number | null | undefined>,
  message = OUT_OF_SCOPE_EMPLOYEE_MESSAGE,
): Promise<void> {
  if (scope.allowedBranchIds(user) === null) return;
  const scoped = await scopedEmployees(prisma, scope, user);
  const codes = new Set(scoped?.codes ?? []);
  for (const code of empCodes) {
    if (code == null || !codes.has(Number(code))) throw new ForbiddenException(message);
  }
}
