import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

function makeService(siblingBranchIds = async (id: number) => [id]) {
  const prisma = {
    club_members: { findFirst: jest.fn().mockResolvedValue({ id: 42, branch_id: 2, name: 'عضو', member_code: '123', is_active: true }) },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(15) },
    club_subscription_freezes: { findMany: jest.fn().mockResolvedValue([
      { subscription_id: 1, subscription: { subscription_number: 'OLD' }, is_active: true, planned_days: 7 },
      { subscription_id: 2, subscription: { subscription_number: 'OLDER' }, is_active: false, actual_days: 3 },
    ]) },
    club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    club_attendance: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    club_receipts: { findMany: jest.fn().mockResolvedValue([{ id: 1, amount: '125.50', receipt_number: 'R1', receipt_date: '2026-10-12' }]) },
  };
  const branchScope = { resolveListFilter: jest.fn<null | number[], []>().mockReturnValue(null), isMemberGenderAllowed: jest.fn().mockReturnValue(true) };
  const points = { history: jest.fn().mockResolvedValue({ memberId: 42, points: 50, value: 5, history: [{ id: 1, type: 'earn', points: 50 }] }) };
  const service = new ClubAttendanceService(prisma as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never, branchScope as never, { siblingBranchIds } as never, points as never);
  return { service, prisma, branchScope, points };
}

describe('reception member profile', () => {
  it('resolves the selected member by id and returns recent subscriptions plus complete freeze and locker history', async () => {
    const { service, prisma } = makeService();
    const result = await service.memberOverview('', undefined, '42');
    expect(prisma.club_members.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { is_deleted: false, id: 42 } }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: 42 }, orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
    }));
    expect(prisma.club_subscription_freezes.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(prisma.club_locker_subscriptions.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(result.subscriptionCount).toBe(15);
    expect(result.freezes).toHaveLength(2);
    expect(result.frozenCount).toBe(1);
    expect(result.suspendedDays).toBe(7);
    expect(result.recentReceipts[0].amount).toBe(125.5);
    expect(result.points?.points).toBe(50);
    expect(result.points?.history).toHaveLength(1);
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ member_id: 42 }, { subscription: { member_id: 42 } }, { locker_subscription: { member_id: 42 } }] }, take: 10,
    }));
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { member_id: 42 }, take: 10 }));
  });

  it('preserves existing barcode and national id lookup', async () => {
    const { service, prisma } = makeService();
    await service.memberOverview(' 123 ');
    expect(prisma.club_members.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { is_deleted: false, OR: [{ member_code: '123' }, { card_number: '123' }] } }));
  });

  it('rejects a selected member outside the allowed branches before loading linked records', async () => {
    const { service, prisma, branchScope, points } = makeService();
    branchScope.resolveListFilter.mockReturnValue([3]);
    await expect(service.memberOverview('', undefined, '42')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
    expect(prisma.club_receipts.findMany).not.toHaveBeenCalled();
    expect(points.history).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects invalid member id %s before reading data', async (id) => {
    const { service, prisma } = makeService();
    await expect(service.memberOverview('', undefined, id)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_members.findFirst).not.toHaveBeenCalled();
  });

  it('allows reception to load an older member through the desk profile', async () => {
    const { service, prisma } = makeService();
    prisma.club_members.findFirst.mockResolvedValue({ id: 42, branch_id: 2, name: 'عضو', member_code: '123', is_active: true, created_at: new Date('2020-01-01') } as never);
    const profile = await service.memberOverview('', { sub: 10, level: 2, job_title: 'موظف استقبال' } as never, '42');
    expect(profile.member.name).toBe('عضو');
    expect(profile.member.createdAt).toEqual(new Date('2020-01-01'));
  });

  it('rejects members from a denied gender section before loading linked records', async () => {
    const { service, prisma, branchScope } = makeService();
    branchScope.isMemberGenderAllowed.mockReturnValue(false);
    await expect(service.memberOverview('', undefined, '42')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
  });

  it.each([[3, 8], [8, 3]])('allows profile lookup from grouped reception branch %i to branch %i', async (operatorBranch, memberBranch) => {
    const { service, prisma } = makeService(async () => [3, 8]);
    prisma.club_members.findFirst.mockResolvedValue({ id: 42, branch_id: memberBranch, name: 'عضو', member_code: '123', is_active: true } as never);
    const profile = await service.memberOverview('', { sub: 10, level: 2, branch: operatorBranch } as never, '42');
    expect(profile.member.branchId).toBe(memberBranch);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalled();
  });
});
