import { Prisma } from '@prisma/client';

/** A dedicated InnoDB row works even when the legacy employees table is MyISAM.
 * The upsert takes an exclusive lock held until the surrounding transaction ends.
 */
export async function lockPayrollEmployee(tx: Prisma.TransactionClient, employeeId: number) {
  await tx.$executeRaw`
    INSERT INTO fin_payroll_employee_locks (employee_id) VALUES (${employeeId})
    ON DUPLICATE KEY UPDATE employee_id = employee_id
  `;
}
