/** Shown when a staff account belongs to an employee marked inactive (موقوف) or removed. */
export const INACTIVE_EMPLOYEE = 'حساب الموظف غير نشط، تواصل مع الإدارة';

/** employees.employee_type: 1 = نشط, 2 = موقوف. leave_emp = 1 means the employee was removed. */
export function isEmployeeInactive(
  employee: { employee_type?: number | null; leave_emp?: number | null } | null | undefined,
): boolean {
  if (!employee) return false;
  return employee.employee_type === 2 || employee.leave_emp === 1;
}

/** Login refusal that names the linked HR record (name and code) when it is known. */
export function inactiveEmployeeMessage(
  employee: { employee?: string | null; emp_code?: number | null; leave_emp?: number | null } | null | undefined,
): string {
  const who = [employee?.employee?.trim(), employee?.emp_code != null ? `كود ${employee.emp_code}` : null]
    .filter(Boolean)
    .join(' - ');
  if (!who) return INACTIVE_EMPLOYEE;
  const state = employee?.leave_emp === 1 ? 'محذوف من الموارد البشرية' : 'موقوف';
  return `ملف الموظف المرتبط بهذا الحساب (${who}) ${state}، تواصل مع الإدارة`;
}
