import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { fakeChainPrisma, jwt } from '../../common/hr-approval/approval-chain.fixture-spec';
import { PermissionsService } from './permissions.service';

describe('Permissions approval chain (direct manager → HR → department manager)', () => {
  const setup = (overrides?: Parameters<typeof fakeChainPrisma>[0]) => {
    const prisma = fakeChainPrisma(overrides);
    const push = { pushToUsers: jest.fn().mockResolvedValue(1) };
    const service = new PermissionsService(prisma as never, undefined, new BranchScopeService(), push as never);
    return { prisma, service, push };
  };
  const file = (service: PermissionsService) =>
    service.create({ no3Ezn: 2, eznDate: '2026-12-01', fromHour: '10:00', toHour: '11:00', reason: 'مشوار' } as never, 100, 'موظف');
  const order = (prisma: ReturnType<typeof fakeChainPrisma>, id: number) =>
    prisma.hr_all_ozonat_orders.rows.find((r) => r.id === id)!;

  it('walks the owner order and is final (suspend 4) only after the department manager', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    expect(order(prisma, id).current_to_user_id).toBe(200);
    await expect(service.action(id, { action: 'accept' }, 200, 'م', jwt(200, 3))).resolves.toMatchObject({ nextStage: 'approve_hr', suspend: 1 });
    await expect(service.action(id, { action: 'accept' }, 300, 'HR', jwt(300))).resolves.toMatchObject({ nextStage: 'approve_moder_edara', suspend: 1 });
    await expect(service.action(id, { action: 'accept' }, 400, 'إ', jwt(400, 3))).resolves.toMatchObject({ final: true, suspend: 4, status: 'approved' });
    expect(order(prisma, id).close_talab).toBe('yes');
  });

  it('skips the department manager when none is configured: HR approval is final', async () => {
    const { prisma, service } = setup({
      settings: [{ id: 1, job_title_code_fk: 44, person_id: 30, person_code: '1030', person_name: 'HR', person_suspend: 1 }],
    });
    const { id } = await file(service);
    await service.action(id, { action: 'accept' }, 200, 'م', jwt(200, 3));
    await expect(service.action(id, { action: 'accept' }, 300, 'HR', jwt(300))).resolves.toMatchObject({ final: true, suspend: 4 });
    expect(order(prisma, id).approve_moder_edara).toBe('yes');
  });

  it('never routes to the requester and refuses an unauthorized approver (mobile PATCH path)', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    expect(order(prisma, id).current_to_user_id).not.toBe(100);
    await expect(service.action(id, { action: 'accept' }, 500, 'x', jwt(500))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.action(id, { action: 'accept' }, 100, 'x', jwt(100))).rejects.toThrow('لا يمكنك اعتماد طلبك بنفسك');
  });

  it('HR may override a step routed to someone else, recorded in the history', async () => {
    const { prisma, service } = setup();
    const { id } = await file(service);
    await expect(service.action(id, { action: 'reject', reason: 'لا' }, 300, 'HR', jwt(300))).resolves.toMatchObject({ override: true, suspend: 2 });
    expect(prisma.hr_all_ozonat_history.rows.some((h) => String(h.talab_msg).includes('تجاوز من الموارد البشرية'))).toBe(true);
  });

  it('branch-scopes the by-id endpoints', async () => {
    const { prisma, service } = setup();
    prisma.employees.rows.push({ id: 90, emp_code: 1090, employee: 'فرع آخر', manger: null, emp_type: 1, edara_id: null, branch_id_fk: 9 });
    prisma.hr_all_ozonat_orders.rows.push({ id: 55, emp_id_fk: 90, publisher: 999, current_to_user_id: 998, cancel: 'no', suspend: 0 });
    const branchManager = { ...jwt(200, 3, 20), branch: 1 };
    await expect(service.details(55, branchManager)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(55, branchManager)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.approve(55, 200, 'm', branchManager)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
