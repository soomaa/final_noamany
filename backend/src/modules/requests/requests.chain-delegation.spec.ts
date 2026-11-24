import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { fakeChainPrisma, jwt } from '../../common/hr-approval/approval-chain.fixture-spec';
import { OvertimeRequestsService } from '../overtime-requests/overtime-requests.service';
import { RequestsService } from './requests.service';

describe('POST /requests hands chain types to their module', () => {
  const build = () => {
    const prisma = { hr_requests: { create: jest.fn(), aggregate: jest.fn() } };
    const leaves = { create: jest.fn().mockResolvedValue({ id: 5, agaza_rkm: 5 }) };
    const permissions = { create: jest.fn().mockResolvedValue({ id: 6 }) };
    const overtime = { create: jest.fn().mockResolvedValue({ id: 7, status: 'pending' }) };
    const service = new RequestsService(
      prisma as never, {} as never, new BranchScopeService(), {} as never,
      leaves as never, permissions as never, overtime as never, undefined,
    );
    return { prisma, leaves, permissions, overtime, service };
  };

  it('a leave goes through LeavesService (validation + approval chain), not a flat hr_requests row', async () => {
    const { prisma, leaves, service } = build();
    const user = jwt(100, 2, 10);
    await expect(
      service.create({ type: 'leave', leave_type_id: '3', date_from: '2026-12-01', date_to: '2026-12-02', notes: 'سفر' } as never, user),
    ).resolves.toMatchObject({ id: 5, delegated: 'leaves' });
    expect(leaves.create).toHaveBeenCalledWith(
      expect.objectContaining({ leaveTypeId: 3, startDate: '2026-12-01', endDate: '2026-12-02', empId: undefined }),
      100, 'u100', undefined, user,
    );
    expect(prisma.hr_requests.create).not.toHaveBeenCalled();
  });

  it('permission and overtime types are delegated as well', async () => {
    const { permissions, overtime, service } = build();
    const user = jwt(100, 2, 10);
    await service.create({ type: 'permission', permission_type: '1', permission_date: '2026-12-01', time_from: '10:00', time_to: '11:00', reason: 'x' } as never, user);
    expect(permissions.create).toHaveBeenCalledWith(expect.objectContaining({ no3Ezn: 1, eznDate: '2026-12-01', fromHour: '10:00' }), 100, 'u100', user);
    await service.create({ type: 'overtime', date: '2026-12-01', hours: '2', reason: 'جرد' } as never, user);
    expect(overtime.create).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-12-01', hours: 2, reason: 'جرد' }), user, false);
  });
});

describe('Overtime requests (direct manager → HR, final approval records extra hours)', () => {
  type Row = Record<string, any>;
  /** Minimal SQL double for hr_overtime_requests: just enough of the statements the service sends. */
  const sqlTable = () => {
    const rows: Row[] = [];
    const text = (q: { strings?: string[]; sql?: string }) => (q.strings ? q.strings.join('?') : q.sql ?? '');
    return {
      rows,
      $queryRaw: jest.fn(async (q: { values: unknown[]; strings: string[] }) => {
        const sql = text(q);
        if (sql.includes('LAST_INSERT_ID')) return [{ id: rows.length }];
        if (sql.includes('WHERE id =')) return rows.filter((r) => r.id === q.values[0]);
        if (sql.includes('emp_id_fk =') && sql.includes('request_date =')) {
          return rows.filter((r) => r.emp_id_fk === q.values[0] && r.request_date === q.values[1] && ['pending', 'approved'].includes(r.status));
        }
        return [];
      }),
      $executeRaw: jest.fn(async (q: { values: unknown[]; strings: string[] }) => {
        const sql = text(q);
        const v = q.values;
        if (sql.includes('INSERT INTO hr_overtime_requests')) {
          rows.push({
            id: rows.length + 1, emp_id_fk: v[0], emp_code_fk: v[1], emp_name: v[2], branch_id_fk: v[3], request_date: v[4],
            hours: v[5], reason: v[6], status: 'pending', stage: v[7], approve_direct_manager: v[8], approve_hr: 'wait',
            current_to_user_id: v[9], current_to_user_name: v[10], publisher: v[11], publisher_name: v[12], history: v[13],
            direct_manager_user_id: null,
          });
          return 1;
        }
        const id = v[v.length - 2];
        const row = rows.find((r) => r.id === id && r.status === 'pending');
        if (!row) return 0;
        if (sql.includes("status = 'rejected'")) Object.assign(row, { status: 'rejected', stage: null });
        else if (sql.includes('extra_hours_id')) Object.assign(row, { status: v[0], stage: null, extra_hours_id: v[4] });
        else Object.assign(row, { stage: v[0], current_to_user_id: v[2] });
        return 1;
      }),
    };
  };

  const setup = (createExtraHours = jest.fn().mockResolvedValue({ id: 900, message: 'تمت تسجيل الساعات الإضافية بنجاح' })) => {
    const prisma = fakeChainPrisma();
    const sql = sqlTable();
    Object.assign(prisma, sql, { $transaction: async (fn: (tx: unknown) => unknown) => fn(prisma) });
    const push = { sendToUsers: jest.fn().mockResolvedValue({ sent: 1, skipped: 0 }) };
    const attendance = { createExtraHours };
    const service = new OvertimeRequestsService(prisma as never, attendance as never, new BranchScopeService(), push as never);
    return { prisma, sql, service, attendance, push };
  };

  it('final (HR) approval calls AttendanceService.createExtraHours with the request', async () => {
    const { sql, service, attendance, push } = setup();
    const employee = jwt(100, 2, 10);
    const { id, stage } = await service.create({ date: '2026-12-01', hours: 3, reason: 'جرد' }, employee);
    expect(stage).toBe('approve_direct_manager');
    expect(sql.rows[0].current_to_user_id).toBe(200);

    await expect(service.action(id, { action: 'accept' }, jwt(500))).rejects.toThrow('هذا الطلب غير محول إليك');
    await expect(service.action(id, { action: 'accept' }, employee)).rejects.toThrow('لا يمكنك اعتماد طلبك بنفسك');

    await expect(service.action(id, { action: 'accept' }, jwt(200, 3))).resolves.toMatchObject({ status: 'pending', stage: 'approve_hr', final: false });
    expect(attendance.createExtraHours).not.toHaveBeenCalled();

    const final = await service.action(id, { action: 'accept' }, jwt(300));
    expect(final).toMatchObject({ status: 'approved', final: true, extraHoursId: 900 });
    expect(attendance.createExtraHours).toHaveBeenCalledWith(
      expect.objectContaining({ empId: 10, numHours: 3, edafaDate: '2026-12-01' }),
      300,
    );
    expect(sql.rows[0].status).toBe('approved');
    expect(push.sendToUsers).toHaveBeenLastCalledWith([100], 'تم اعتماد طلب الساعات الإضافية', expect.any(String), 300);
  });

  it('a fingerprint / validation failure keeps the request pending with the reason', async () => {
    const { sql, service } = setup(jest.fn().mockRejectedValue(new Error('لا توجد بصمة انصراف')));
    const { id } = await service.create({ date: '2026-12-02', hours: 2, reason: 'x' }, jwt(100, 2, 10));
    await service.action(id, { action: 'accept' }, jwt(200, 3));
    await expect(service.action(id, { action: 'accept' }, jwt(300))).rejects.toThrow('لا توجد بصمة انصراف');
    expect(sql.rows[0].status).toBe('pending');
  });

  it('rejection never records extra hours', async () => {
    const { sql, service, attendance } = setup();
    const { id } = await service.create({ date: '2026-12-03', hours: 1, reason: 'x' }, jwt(100, 2, 10));
    await expect(service.action(id, { action: 'reject' }, jwt(200, 3))).resolves.toMatchObject({ status: 'rejected' });
    expect(attendance.createExtraHours).not.toHaveBeenCalled();
    expect(sql.rows[0].status).toBe('rejected');
  });
});
