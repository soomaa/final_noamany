import { ClubDashboardService } from './club-dashboard.service';

function subject() {
  const prisma = {
    club_members: { findMany: jest.fn().mockResolvedValue([{ id: 44 }]) },
    club_receipt_payments: { groupBy: jest.fn().mockResolvedValue([]) },
    club_receipts: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_subscriptions: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_locker_subscriptions: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_spa_invoices: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_inbody_invoices: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([3]),
    memberGenderFilter: jest.fn().mockReturnValue('female'),
  };
  const permissions = { isSuperAdmin: jest.fn().mockResolvedValue(true) };
  return {
    prisma,
    service: new ClubDashboardService(prisma as never, branchScope as never, permissions as never),
  };
}

describe('ClubDashboardService treasury audience scope', () => {
  it('applies canonical audience to every summary source', async () => {
    const { prisma, service } = subject();
    await service.treasury({}, { sub: 1 } as never);

    expect(prisma.club_receipts.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        expect.objectContaining({ OR: expect.any(Array) }),
      ]) }),
    }));
    expect(prisma.club_subscriptions.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_locker_subscriptions.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_spa_invoices.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member_id: { in: [44] } }),
    }));
    expect(prisma.club_inbody_invoices.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });

  it('applies the same audience to detailed treasury rows', async () => {
    const { prisma, service } = subject();
    await service.treasury({ date: '2026-09-09' }, { sub: 1 } as never);

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_spa_invoices.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member_id: { in: [44] } }),
    }));
    expect(prisma.club_inbody_invoices.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });
});
