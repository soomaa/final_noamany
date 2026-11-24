import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import {
  APPROVAL_CHAIN_ORDER,
  FINAL_APPROVAL_SUSPEND,
  isFinalApproval,
  pendingStage,
} from '../../common/hr-approval/approval-chain';
import { fakeChainPrisma, jwt } from '../../common/hr-approval/approval-chain.fixture-spec';
import { LeavesService } from './leaves.service';

describe('Leaves approval chain (24 Nov: direct manager → HR → department manager)', () => {
  const setup = (overrides?: Parameters<typeof fakeChainPrisma>[0]) => {
    const prisma = fakeChainPrisma(overrides);
    const push = { pushToUsers: jest.fn().mockResolvedValue(1) };
    const service = new LeavesService(prisma as never, new BranchScopeService(), undefined, push as never);
    return { prisma, service, push };
  };
  const file = (service: LeavesService, publisher = 100) =>
    service.create({ leaveTypeId: 3, startDate: '2026-12-01', endDate: '2026-12-05' } as never, publisher, 'موظف');
  const order = (prisma: ReturnType<typeof fakeChainPrisma>, id: number) =>
    prisma.hr_all_agzat_orders.rows.find((r) => r.id === id)!;

  it('declares the owner order and a single final-approval status (suspend 4)', () => {
    expect(APPROVAL_CHAIN_ORDER).toEqual(['approve_direct_manager', 'approve_hr', 'approve_moder_edara']);
    expect(FINAL_APPROVAL_SUSPEND).toBe(4);
    expect(isFinalApproval({ suspend: 1 })).toBe(false);
    expect(isFinalApproval({ suspend: 4 })).toBe(true);
  });

  it('routes direct manager → HR → department manager, final only at the last step', async () => {
    const { prisma, service, push } = setup();
    const { id } = await file(service);
    expect(order(prisma, id).current_to_user_id).toBe(200);
    expect(push.pushToUsers).toHaveBeenCalledWith([200], expect.any(String), expect.any(String));

    const dm = await service.action(id, { action: 'accept' }, 200, 'مدير', jwt(200, 3));
    expect(dm).toMatchObject({ stage: 'approve_direct_manager', nextStage: 'approve_hr', suspend: 1, final: false });
    expect(order(prisma, id).current_to_user_id).toBe(300);

    const hr = await service.action(id, { action: 'accept' }, 300, 'HR', jwt(300));
    expect(hr).toMatchObject({ stage: 'approve_hr', nextStage: 'approve_moder_edara', suspend: 1, final: false });
    expect(order(prisma, id).current_to_user_id).toBe(400);

    const dept = await service.action(id, { action: 'accept' }, 400, 'إدارة', jwt(400, 3));
    expect(dept).toMatchObject({ stage: 'approve_moder_edara', suspend: 4, final: true, status: 'accepted' });
    expect(order(prisma, id)).toMatchObject({ suspend: 4, close_talab: 'yes', current_to_user_id: 100 });
    expect(pendingStage(order(prisma, id) as never)).toBeNull();
    // employee hears about the final result by push
    expect(push.pushToUsers).toHaveBeenLastCalledWith([100], 'تم اعتماد طلب الإجازة', expect.any(String));
  });

  it('never routes to the requester: a manager filing for himself skips to HR', async () => {
    // The requester (employee 10) is his own "direct manager".
    const { prisma, service } = setup({
      employees: [
        { id: 10, emp_code: 1010, employee: 'موظف', manger: '10', emp_type: 1, edara_id: null, branch_id_fk: 1 },
        { id: 30, emp_code: 1030, employee: 'الموارد البشرية', manger: null, emp_type: 1, edara_id: null },
      ],
    });
    const { id } = await file(service);
    const row = order(prisma, id);
    expect(row.current_to_user_id).toBe(300);
    expect(row.approve_direct_manager).toBe('yes'); // skipped step
    expect(prisma.hr_all_agzat_history.rows.some((h) => h.reason_action === 'skip_approve_direct_manager')).toBe(true);
  });

  it('falls back to an admin when there is no direct manager and no HR officer — never an empty recipient', async () => {
    const { prisma, service } = setup({
      employees: [{ id: 10, emp_code: 1010, employee: 'موظف', manger: null, emp_type: 1, edara_id: null, branch_id_fk: 1 }],
      settings: [],
    });
    const { id } = await file(service);
    expect(order(prisma, id).current_to_user_id).toBe(1);
  });

  it('rejects an approver the request is not routed to (and the requester himself)', async () => {
    const { service } = setup();
    const { id } = await file(service);
    await expect(service.action(id, { action: 'accept' }, 500, 'x', jwt(500))).rejects.toThrow('هذا الطلب غير محول إليك');
    await expect(service.action(id, { action: 'accept' }, 400, 'x', jwt(400, 3))).rejects.toThrow('هذا الطلب غير محول إليك');
    await expect(service.action(id, { action: 'accept' }, 100, 'x', jwt(100))).rejects.toThrow('لا يمكنك اعتماد طلبك بنفسك');
  });

  it('lets HR override the pending step and records it in the history', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    // Pending at the direct manager; HR decides instead. HR is also the next step → one decision.
    const result = await service.action(id, { action: 'accept' }, 300, 'HR', jwt(300));
    expect(result).toMatchObject({ override: true, stage: 'approve_direct_manager', nextStage: 'approve_moder_edara' });
    expect(order(prisma, id)).toMatchObject({ approve_direct_manager: 'yes', approve_hr: 'yes', current_to_user_id: 400 });
    expect(prisma.hr_all_agzat_history.rows.some((h) => String(h.talab_msg).includes('تجاوز'))).toBe(true);
  });

  it('lets an admin reject on behalf of the routed approver', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    await expect(service.action(id, { action: 'reject', reason: 'لا' }, 1, 'admin', jwt(1, 1))).resolves.toMatchObject({
      override: true,
      status: 'rejected',
      suspend: 2,
    });
    expect(order(prisma, id).current_to_user_id).toBe(100);
  });

  it('partial approval narrows the dates inside the requested range and keeps the original', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    await expect(
      service.action(id, { action: 'accept', startDate: '2026-11-30', endDate: '2026-12-02' }, 200, 'مدير', jwt(200, 3)),
    ).rejects.toThrow('الاعتماد الجزئي يجب أن يكون داخل الفترة المطلوبة');

    const result = await service.action(id, { action: 'accept', startDate: '2026-12-02', endDate: '2026-12-03' }, 200, 'مدير', jwt(200, 3));
    expect(result).toMatchObject({ approvedFrom: '2026-12-02', approvedTo: '2026-12-03', approvedDays: 2, status: 'accepted' });
    expect(order(prisma, id)).toMatchObject({ agaza_from_date_m: '2026-12-02', agaza_to_date_m: '2026-12-03', num_days: 2 });
    // original range stored (raw SQL column) and in the history
    expect(prisma.$executeRaw).toHaveBeenCalled();
    const calls = prisma.$executeRaw.mock.calls.map((c) => (c as unknown[])[0] as { strings: string[]; values: unknown[] });
    const sql = calls.find((c) => c.strings.join('?').includes('requested_from_date_m'))!;
    expect(sql.values).toEqual(expect.arrayContaining(['2026-12-01', '2026-12-05', 5, id]));
    expect(prisma.hr_all_agzat_history.rows.some((h) => h.talab_msg === 'اعتماد جزئي')).toBe(true);
  });

  it('a row created under the old order (waiting for HR after the department manager) finishes at HR', async () => {
    const { prisma, service } = setup();
    prisma.hr_all_agzat_orders.rows.push({
      id: 77, agaza_rkm: 77, emp_id_fk: 10, publisher: 100, suspend: 4, current_to_user_id: 300,
      actions_sends: 'approve_moder_edara', approve_direct_manager: 'yes', approve_moder_edara: 'yes', approve_hr: 'wait',
      approve_moder_3am: 'wait', close_talab: 'wait', agaza_from_date_m: '2026-10-01', agaza_to_date_m: '2026-10-01',
    });
    const result = await service.action(77, { action: 'accept' }, 300, 'HR', jwt(300));
    expect(result).toMatchObject({ stage: 'approve_hr', final: true, suspend: 4 });
  });
});
