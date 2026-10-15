/**
 * Named values for HR status/type columns whose numeric codes are stored in the
 * database. The numbers are the actual DB values and must not change without a
 * data migration — these constants only make the code self-documenting.
 */

/** employees.employee_type */
export const EmployeeType = {
  /** Active / current staff (the set payroll and circulars target). */
  ACTIVE: 1,
} as const;

/** hr_all_agzat_orders.no3_agaza — leave-type codes. */
export const LeaveType = {
  /** إجازة بدون راتب — counts toward without-salary (unpaid) days. */
  UNPAID: 17,
  /** بدل راحة — off-day replacement leave. */
  REPLACEMENT: 19,
} as const;

export { parseShiftType, shiftTypeToLabel, SHIFT_TYPE_LABELS } from './shift-type.util';
