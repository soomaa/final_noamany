import { Prisma } from '@prisma/client';

export type EmployeeExitClient = Prisma.TransactionClient | {
  employees: {
    update: Prisma.employeesDelegate['update'];
    findUnique: Prisma.employeesDelegate['findUnique'];
  };
  users: {
    findMany: Prisma.usersDelegate['findMany'];
    updateMany: Prisma.usersDelegate['updateMany'];
  };
  api_users: {
    updateMany: Prisma.api_usersDelegate['updateMany'];
  };
  staff_auth_sessions: {
    updateMany: Prisma.staff_auth_sessionsDelegate['updateMany'];
  };
  business_audit_log: {
    create: Prisma.business_audit_logDelegate['create'];
  };
};

/**
 * Unified employee-exit effect: archive, clearance completion, and list "delete"
 * all set `leave_emp = 1` so the person leaves ordinary payroll.
 */
export async function markEmployeeExited(
  client: EmployeeExitClient,
  input: {
    employeeId: number;
    lastWorkingDate?: string | null;
    reason?: string | null;
    actorUserId?: number | null;
  },
) {
  const employee = await client.employees.findUnique({
    where: { id: input.employeeId },
    select: { app_user_id: true, branch_id_fk: true, leave_emp: true },
  });
  const data: Prisma.employeesUpdateInput = { leave_emp: 1 };
  if (input.lastWorkingDate) data.end_service_date_m = input.lastWorkingDate;
  if (input.reason) data.reason = input.reason;
  await client.employees.update({
    where: { id: input.employeeId },
    data,
  });

  const linkedUsers = await client.users.findMany({
    where: { emp_code: input.employeeId },
    select: { user_id: true },
  });
  const userIds = linkedUsers.map((user) => user.user_id);
  if (userIds.length) {
    await client.users.updateMany({
      where: { user_id: { in: userIds } },
      data: { approved: 0, device_token: '' },
    });
    await client.staff_auth_sessions.updateMany({
      where: { user_id: { in: userIds }, revoked_at: null },
      data: {
        revoked_at: new Date(),
        revocation_reason: 'employee_offboarded',
      },
    });
  }
  if (employee?.app_user_id != null) {
    await client.api_users.updateMany({
      where: { user_id: employee.app_user_id },
      data: { status: 0 },
    });
  }
  await client.business_audit_log.create({
    data: {
      entity_type: 'employee',
      entity_id: String(input.employeeId),
      action: 'employee.offboarded',
      actor_user_id: input.actorUserId ?? null,
      branch_id: employee?.branch_id_fk ?? null,
      before_json: { leaveEmp: employee?.leave_emp ?? null },
      after_json: {
        leaveEmp: 1,
        accountsDisabled: userIds.length,
        mobileAccountDisabled: employee?.app_user_id != null,
      },
      changed_fields: ['leave_emp', 'account_status', 'sessions'],
      reason: input.reason ?? null,
    },
  });
}

export async function restoreEmployee(
  client: EmployeeExitClient,
  employeeId: number,
) {
  await client.employees.update({
    where: { id: employeeId },
    data: { leave_emp: 0, end_service_date_m: null },
  });
}
