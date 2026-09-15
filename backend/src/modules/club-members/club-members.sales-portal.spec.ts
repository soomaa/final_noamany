import { ForbiddenException } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';

describe('ClubMembersService sales portal contract', () => {
  const user = { sub: 9, emp_code: 77, branch: 1 } as never;

  function subject() {
    const prisma = {
      employees: { findUnique: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ mosma_wazefy_code: null, mosma_wazefy_n: where.id === 77 ? 'أخصائي مبيعات' : 'موظف استقبال' })) },
      department_jobs: { findUnique: jest.fn() },
      club_members: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{ id: 5, member_code: 'M-5', name: 'عضو', phone: '010', is_active: true, created_at: new Date() }]),
      },
      club_leads: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([1]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
      isBranchAllowed: jest.fn().mockReturnValue(true),
    };
    return { service: new ClubMembersService(prisma as never, { log: jest.fn() } as never, branchScope as never, {} as never, {} as never), prisma };
  }

  it('returns only the logged-in salesperson’s branch-scoped member summary', async () => {
    const { service, prisma } = subject();

    const result = await (service as any).salesPortal(user);

    expect(result.statistics.totalAssigned).toBe(1);
    expect(result).toEqual(expect.objectContaining({
      specialist: expect.objectContaining({ employeeId: 77, branchId: 1 }),
      performance: expect.objectContaining({ assignedLeads: 0, closedDeals: 0 }),
      pipeline: { new: 0, inProgress: 0, followLater: 0, qualified: 0, converted: 0, lost: 0 },
      closedDeals: [],
    }));
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: { in: [1] }, OR: [{ sales_id: 77 }, { created_by: 9 }] }),
    }));
  });

  it('rejects a non-sales employee', async () => {
    const { service } = subject();
    await expect((service as any).salesPortal({ sub: 10, emp_code: 88, branch: 1 })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
