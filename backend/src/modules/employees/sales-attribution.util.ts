/**
 * One gate for "does this employee sell?", shared by every place that reads or
 * writes sales attribution. Three copies of this check used to drift apart, and a
 * rep who passed one gate but failed another had their sales written with
 * `sales_id = NULL` — invisible to their dashboard, the MOS reports and commissions.
 *
 * Ported from MetaFit. In Noamany a rep is the `is_sales` toggle («يعمل كأخصائي مبيعات») OR the
 * «أخصائي مبيعات» job title (also its legacy names) — the same rule `EmployeesService.isSalesEmployee`
 * and the sales-rep dropdown use — so the sales workspace and the lead scoping agree with the rest
 * of Noamany.
 */
import { isMarketingRepJobTitle } from './marketing-rep.util';

type EmployeeRow = {
  id: number;
  emp_code: number | null;
  is_sales: boolean;
  mosma_wazefy_n?: string | null;
};

type EmployeeLookupPrisma = {
  employees: {
    findUnique: (args: object) => Promise<EmployeeRow | null>;
    findFirst: (args: object) => Promise<EmployeeRow | null>;
  };
};

type UserLookupPrisma = EmployeeLookupPrisma & {
  users: { findMany: (args: object) => Promise<Array<{ user_id: number }>> };
};

const EMPLOYEE_SELECT = { id: true, emp_code: true, is_sales: true, mosma_wazefy_n: true };

/** Noamany's «does this employee sell?»: the toggle or the sales job title. */
export function employeeSells(emp: Pick<EmployeeRow, 'is_sales' | 'mosma_wazefy_n'> | null | undefined): boolean {
  return !!emp && (emp.is_sales === true || isMarketingRepJobTitle(emp.mosma_wazefy_n));
}

/**
 * The employee behind a login. `users.emp_code` normally holds `employees.id`
 * (see JwtUser), but part of the data — and the demo seed — links it to the
 * business key `employees.emp_code` instead. `id` is tried first so a correctly
 * linked login can never resolve to someone else; the fallback only rescues logins
 * that would otherwise resolve to nobody at all.
 */
export async function employeeForLogin(
  prisma: EmployeeLookupPrisma,
  userEmpCode: number | null | undefined,
): Promise<EmployeeRow | null> {
  if (!userEmpCode || userEmpCode <= 0) return null;
  const byId = await prisma.employees.findUnique({ where: { id: userEmpCode }, select: EMPLOYEE_SELECT });
  if (byId) return byId;
  return prisma.employees.findFirst({ where: { emp_code: userEmpCode }, select: EMPLOYEE_SELECT });
}

/** `employees.id` for a login — the value every `sales_id` / `employee_id` holds. */
export async function employeeIdForLogin(
  prisma: EmployeeLookupPrisma,
  userEmpCode: number | null | undefined,
): Promise<number | null> {
  return (await employeeForLogin(prisma, userEmpCode))?.id ?? null;
}

/** Whether the employee behind a login sells — EMS's `is_sales` toggle. */
export async function isSalesEmployeeId(
  prisma: EmployeeLookupPrisma,
  employeeId: number | null | undefined,
): Promise<boolean> {
  const emp = await employeeForLogin(prisma, employeeId);
  return employeeSells(emp);
}

/**
 * Login ids belonging to an employee. Rows carry `created_by` (a `users.user_id`)
 * even when `sales_id` was never filled in, so this is what lets a rep still see
 * the subscriptions they typed in before attribution was enforced.
 */
export async function loginIdsForEmployee(
  prisma: UserLookupPrisma,
  employeeId: number | null | undefined,
): Promise<number[]> {
  if (!employeeId || employeeId <= 0) return [];
  // Matches both linkage conventions, so the rep's own history is found either way.
  const employee = await prisma.employees.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
  const keys = [...new Set([employeeId, employee?.emp_code].filter((k): k is number => k != null && k > 0))];
  const rows = await prisma.users.findMany({
    where: { emp_code: { in: keys } },
    select: { user_id: true },
  });
  return rows.map((row) => row.user_id);
}
