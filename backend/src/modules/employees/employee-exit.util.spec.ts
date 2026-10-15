import { markEmployeeExited, restoreEmployee } from './employee-exit.util';

describe('employee exit security effect', () => {
  function makeClient() {
    return {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 17, app_user_id: 31, branch_id_fk: 3 }),
        update: jest.fn(),
      },
      users: {
        findMany: jest.fn().mockResolvedValue([{ user_id: 7 }, { user_id: 8 }]),
        updateMany: jest.fn(),
      },
      api_users: { updateMany: jest.fn() },
      staff_auth_sessions: { updateMany: jest.fn() },
      business_audit_log: { create: jest.fn() },
    };
  }

  it('disables every linked account and revokes staff sessions in the same client', async () => {
    const client = makeClient();

    await markEmployeeExited(client as never, {
      employeeId: 17,
      lastWorkingDate: '2026-08-26',
      reason: 'إنهاء خدمة',
      actorUserId: 99,
    });

    expect(client.users.findMany).toHaveBeenCalledWith({
      where: { emp_code: 17 },
      select: { user_id: true },
    });
    expect(client.users.updateMany).toHaveBeenCalledWith({
      where: { user_id: { in: [7, 8] } },
      data: { approved: 0, device_token: '' },
    });
    expect(client.api_users.updateMany).toHaveBeenCalledWith({
      where: { user_id: 31 },
      data: { status: 0 },
    });
    expect(client.staff_auth_sessions.updateMany).toHaveBeenCalledWith({
      where: { user_id: { in: [7, 8] }, revoked_at: null },
      data: expect.objectContaining({ revocation_reason: 'employee_offboarded' }),
    });
    expect(client.business_audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity_type: 'employee',
        entity_id: '17',
        action: 'employee.offboarded',
        actor_user_id: 99,
        branch_id: 3,
      }),
    });
  });

  it('restoring the HR row does not silently reactivate credentials', async () => {
    const client = makeClient();

    await restoreEmployee(client as never, 17);

    expect(client.employees.update).toHaveBeenCalled();
    expect(client.users.updateMany).not.toHaveBeenCalled();
    expect(client.api_users.updateMany).not.toHaveBeenCalled();
  });
});
