import { MobileController } from './mobile.controller';

describe('MobileController employee self-service lookups', () => {
  const mobile = { employeeIdByPhone: jest.fn() };
  const permissions = { available: jest.fn(), list: jest.fn(), action: jest.fn(), selfDetail: jest.fn() };
  const leaves = { listTypes: jest.fn(), list: jest.fn(), action: jest.fn(), create: jest.fn() };
  const attendance = {
    syncOfflinePunch: jest.fn(), listShifts: jest.fn(), createShiftSwap: jest.fn(), createExtraHours: jest.fn(),
    basmaReport: jest.fn(), lateReport: jest.fn(), absenceReport: jest.fn(),
  };
  const compat = { identity: jest.fn(), permissionDetail: jest.fn(), shiftChanges: jest.fn(), overtime: jest.fn() };
  const loans = {};
  const evaluations = { myEvaluations: jest.fn(), myEvaluation: jest.fn() };
  const controller = new MobileController(
    mobile as never,
    permissions as never,
    leaves as never,
    attendance as never,
    compat as never,
    loans as never,
    evaluations as never,
  );
  const user = { sub: 44, emp_code: 8, name: 'موظف' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('lists leave types for a signed-in employee without requiring the HR management permission', async () => {
    leaves.listTypes.mockResolvedValue({ data: [{ id: 19, title: 'سنوية' }] });

    await expect(controller.leaveTypes()).resolves.toEqual({ data: [{ id: 19, title: 'سنوية' }] });
    expect(leaves.listTypes).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100, order: 'desc' }));
  });

  it('returns the permission balance only for the signed-in employee', async () => {
    permissions.available.mockResolvedValue({ remainMinutes: 120, remainNum: 2 });

    await expect(controller.permissionAvailability('2026-08-20', user)).resolves.toEqual({ remainMinutes: 120, remainNum: 2 });
    expect(permissions.available).toHaveBeenCalledWith(8, '2026-08-20');
  });

  it('returns a permission detail only through the authenticated employee owner scope', async () => {
    compat.identity.mockResolvedValue({ id: 81, empCode: 8 });
    permissions.selfDetail.mockResolvedValue({ id: 19, emp_id_fk: 81 });

    await expect(controller.permissionDetail(19, user)).resolves.toEqual({ id: 19, emp_id_fk: 81 });
    expect(permissions.selfDetail).toHaveBeenCalledWith(19, 81, 44);
    expect(compat.permissionDetail).not.toHaveBeenCalled();
  });

  it('lists and opens evaluations using the authenticated employee identity', async () => {
    compat.identity.mockResolvedValue({ id: 81, empCode: 8 });
    evaluations.myEvaluations.mockResolvedValue([{ id: 55, employee_id: 81 }]);
    evaluations.myEvaluation.mockResolvedValue({ id: 55, employee_id: 81 });

    await expect(controller.myEvaluations('2026-09', user)).resolves.toEqual([{ id: 55, employee_id: 81 }]);
    await expect(controller.myEvaluation(55, user)).resolves.toEqual({ id: 55, employee_id: 81 });

    expect(evaluations.myEvaluations).toHaveBeenCalledWith(81, { monthKey: '2026-09' });
    expect(evaluations.myEvaluation).toHaveBeenCalledWith(81, 55);
  });

  it('forwards an offline attendance record to the signed-in employee service', async () => {
    const dto = {
      offlineId: '6c2d91fd-4637-4172-8e78-4c2f1bfe1c58',
      capturedAtUtc: '2026-08-23T20:15:00.000Z',
      timezone: 'Africa/Cairo',
      lat: '30.0444',
      long: '31.2357',
    };
    attendance.syncOfflinePunch.mockResolvedValue({ id: 55, type: 'in' });

    await expect((controller as any).offlineAttendanceSync(dto, user)).resolves.toEqual({ id: 55, type: 'in' });
    expect(attendance.syncOfflinePunch).toHaveBeenCalledWith(user, dto);
  });

  it('lists leave requests in the signed-in employee outgoing tab by default', async () => {
    leaves.list.mockResolvedValue({ data: [] });
    const query = { page: 1, pageSize: 20 } as never;

    await expect(controller.leaves(query, user)).resolves.toEqual({ data: [] });

    expect(leaves.list).toHaveBeenCalledWith(expect.objectContaining({ mode: 'sader' }), user.sub);
  });

  it('forwards a leave approval action as the signed-in recipient', async () => {
    leaves.action.mockResolvedValue({ id: 18, status: 'accepted' });

    await expect(controller.actionLeave(18, { action: 'accept' }, user)).resolves.toEqual({ id: 18, status: 'accepted' });
    expect(leaves.action).toHaveBeenCalledWith(18, { action: 'accept' }, user.sub, user.name);
  });

  it('keeps the requested permission tab and forwards its approval action', async () => {
    permissions.list.mockResolvedValue({ data: [] });
    permissions.action.mockResolvedValue({ id: 9, status: 'accepted' });
    const query = { mode: 'wared', page: 1, pageSize: 20 } as never;

    await expect(controller.permissionsList(query, user)).resolves.toEqual({ data: [] });
    await expect(controller.actionPermission(9, { action: 'accept' }, user)).resolves.toEqual({ id: 9, status: 'accepted' });

    expect(permissions.list).toHaveBeenCalledWith(expect.objectContaining({ mode: 'wared' }), user.sub);
    expect(permissions.action).toHaveBeenCalledWith(9, { action: 'accept' }, user.sub, user.name);
  });

  it('submits an employee leave without activating the legacy leave-balance check', async () => {
    leaves.create.mockResolvedValue({ id: 31 });
    const dto = { leaveTypeId: 4, startDate: '2026-08-23', endDate: '2026-08-23' } as never;

    await expect(controller.createLeave(dto, user)).resolves.toEqual({ id: 31 });
    expect(leaves.create).toHaveBeenCalledWith(dto, user.sub, user.name);
  });

  it('lists employee-owned shift changes, while forwarding a manager target for creation', async () => {
    attendance.listShifts.mockResolvedValue({ data: [{ id: 4, title: 'صباحي' }] });
    compat.shiftChanges.mockResolvedValue([{ id: 9 }]);
    mobile.employeeIdByPhone.mockResolvedValue(77);
    attendance.createShiftSwap.mockResolvedValue({ id: 10 });

    await expect((controller as any).mobileShiftTypes({ page: 1, pageSize: 20 })).resolves.toEqual({ data: [{ id: 4, title: 'صباحي' }] });
    await expect((controller as any).mobileShiftSwaps({ page: 1, perPage: 20, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '2' }, user)).resolves.toEqual([{ id: 9 }]);
    await expect((controller as any).createMobileShiftSwap({ employeePhone: '01000000000', ttype: 1, dwamIdFk: 4, sheftDate: '2026-08-26' }, user)).resolves.toEqual({ id: 10 });
    expect(compat.shiftChanges).toHaveBeenCalledWith(user, { page: 1, per_page: 20, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '2' });
    expect(mobile.employeeIdByPhone).toHaveBeenCalledWith('01000000000');
    expect(attendance.createShiftSwap).toHaveBeenCalledWith({ empId: 77, employeePhone: '01000000000', ttype: 1, dwamIdFk: 4, sheftDate: '2026-08-26' }, 44);
  });

  it('returns the two available shift operation types even when the employee has no records', async () => {
    expect((controller as any).mobileShiftOperationTypes()).toEqual([
      { id: 1, title: 'تبديل شيفت', value: 'swap' },
      { id: 2, title: 'إضافة شيفت', value: 'add' },
    ]);
  });

  it('returns the daily attendance report for the signed-in employee regardless of branch', async () => {
    compat.identity.mockResolvedValue({ id: 44, empCode: 8, branchId: 3, name: 'موظف' });
    attendance.basmaReport.mockResolvedValue({ data: [{ empCode: 8 }] });

    await expect((controller as any).mobileBasmaReport({ empCode: '999', branchId: '999', dateFrom: '2026-08-01', dateTo: '2026-08-25' }, user))
      .resolves.toEqual({ data: [{ empCode: 8 }] });

    expect(attendance.basmaReport).toHaveBeenCalledWith(expect.objectContaining({
      empCode: '8', dateFrom: '2026-08-01', dateTo: '2026-08-25',
    }));
    expect(attendance.basmaReport.mock.calls[0][0].branchId).toBeUndefined();
  });

  it('returns the late report for the signed-in employee regardless of branch', async () => {
    compat.identity.mockResolvedValue({ id: 44, empCode: 8, branchId: 3, name: 'موظف' });
    attendance.lateReport.mockResolvedValue({ data: [{ empCode: 8 }] });

    await expect((controller as any).mobileLateReport({ empCode: '999', branchId: '999' }, user))
      .resolves.toEqual({ data: [{ empCode: 8 }] });

    expect(attendance.lateReport).toHaveBeenCalledWith(expect.objectContaining({ empCode: '8' }));
    expect(attendance.lateReport.mock.calls[0][0].branchId).toBeUndefined();
  });

  it('returns the absence report for the signed-in employee regardless of branch', async () => {
    compat.identity.mockResolvedValue({ id: 44, empCode: 8, branchId: 3, name: 'موظف' });
    attendance.absenceReport.mockResolvedValue({ data: [{ empCode: 8 }] });

    await expect((controller as any).mobileAbsenceReport({ empCode: '999', branchId: '999' }, user))
      .resolves.toEqual({ data: [{ empCode: 8 }] });

    expect(attendance.absenceReport).toHaveBeenCalledWith(expect.objectContaining({ empCode: '8' }));
    expect(attendance.absenceReport.mock.calls[0][0].branchId).toBeUndefined();
  });

  it('lists the authenticated employee extra-hours records and forwards a manager target for creation', async () => {
    compat.overtime.mockResolvedValue([{ id: 15 }]);
    mobile.employeeIdByPhone.mockResolvedValue(77);
    attendance.createExtraHours.mockResolvedValue({ id: 16 });

    await expect((controller as any).mobileExtraHours({ page: 1, perPage: 20, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '3' }, user)).resolves.toEqual([{ id: 15 }]);
    await expect((controller as any).createMobileExtraHours({ employeePhone: '01000000000', numHours: 2, edafaDate: '2026-08-26' }, user)).resolves.toEqual({ id: 16 });
    expect(compat.overtime).toHaveBeenCalledWith(user, { page: 1, per_page: 20, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '3' });
    expect(mobile.employeeIdByPhone).toHaveBeenCalledWith('01000000000');
    expect(attendance.createExtraHours).toHaveBeenCalledWith({ empId: 77, employeePhone: '01000000000', numHours: 2, edafaDate: '2026-08-26' }, 44);
  });
});
