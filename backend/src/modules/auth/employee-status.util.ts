/** Shown when a staff account belongs to an employee marked inactive (موقوف) or removed. */
export const INACTIVE_EMPLOYEE = 'حساب الموظف غير نشط، تواصل مع الإدارة';

/** employees.employee_type: 1 = نشط, 2 = موقوف. leave_emp = 1 means the employee was removed. */
export function isEmployeeInactive(
  employee: { employee_type?: number | null; leave_emp?: number | null } | null | undefined,
): boolean {
  if (!employee) return false;
  return employee.employee_type === 2 || employee.leave_emp === 1;
}
