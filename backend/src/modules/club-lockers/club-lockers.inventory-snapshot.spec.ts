import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubLockersService } from './club-lockers.service';

describe('ClubLockersService inventory snapshot', () => {
  const user = { sub: 5 } as any;

  it('returns the latest two subscriptions and their member phones for lockers in the chosen branch', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 11,
        locker_number: '10',
        is_available: false,
        subscriptions: [
          { customer_name: 'العميل الحالي', subscription_start_date: '2026-10-01', subscription_end_date: '2026-11-01', member: { phone: '01011111111' } },
          { customer_name: 'العميل السابق', subscription_start_date: '2026-08-01', subscription_end_date: '2026-09-01', member: { phone: '01022222222' } },
        ],
      },
      { id: 12, locker_number: '11', is_available: true, subscriptions: [] },
    ]);
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const service = new ClubLockersService({ club_lockers: { findMany } } as any, {} as any, branchScope as any, {} as any, {} as any);

    const result = await service.inventorySnapshot(3, user);

    expect(branchScope.isBranchAllowed).toHaveBeenCalledWith(user, 3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { main_branch_id: 3 },
      select: expect.objectContaining({
        subscriptions: expect.objectContaining({
          take: 2,
          orderBy: [{ subscription_start_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
          select: expect.objectContaining({ member: { select: { phone: true } } }),
        }),
      }),
    }));
    expect(result).toEqual([
      {
        id: 11,
        lockerNumber: '10',
        isAvailable: false,
        latestCustomerName: 'العميل الحالي',
        latestCustomerPhone: '01011111111',
        previousCustomerName: 'العميل السابق',
        previousCustomerPhone: '01022222222',
        latestSubscriptionStartDate: '2026-10-01',
        latestSubscriptionEndDate: '2026-11-01',
      },
      {
        id: 12,
        lockerNumber: '11',
        isAvailable: true,
        latestCustomerName: null,
        latestCustomerPhone: null,
        previousCustomerName: null,
        previousCustomerPhone: null,
        latestSubscriptionStartDate: null,
        latestSubscriptionEndDate: null,
      },
    ]);
  });

  it('rejects invalid or unauthorized branches before reading lockers', async () => {
    const findMany = jest.fn();
    const service = new ClubLockersService(
      { club_lockers: { findMany } } as any,
      {} as any,
      { isBranchAllowed: jest.fn().mockReturnValue(false) } as any,
      {} as any,
      {} as any,
    );

    await expect(service.inventorySnapshot(0, user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.inventorySnapshot(3, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('orders locker numbers naturally in the inventory table', async () => {
    const service = new ClubLockersService(
      { club_lockers: { findMany: jest.fn().mockResolvedValue([
        { id: 10, locker_number: '10', is_available: true, subscriptions: [] },
        { id: 2, locker_number: '2', is_available: true, subscriptions: [] },
      ]) } } as any,
      {} as any,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as any,
      {} as any,
      {} as any,
    );

    const result = await service.inventorySnapshot(3, user);
    expect(result.map((locker) => locker.lockerNumber)).toEqual(['2', '10']);
  });
});
