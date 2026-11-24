import { ForbiddenException } from '@nestjs/common';
import { ClubLockersService } from './club-lockers.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

const branchUser = { sub: 5, level: 2, branch: 3, man_women_type: 3 } as never;

function makeService(prisma: Record<string, any>) {
  prisma.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(prisma));
  const service = new ClubLockersService(prisma as never, {} as never, new BranchScopeService(), {} as never, {} as never);
  (service as any).generateLockNumber = jest.fn().mockResolvedValue('L-000001');
  return service;
}

describe('ClubLockersService locker subscription branch scope', () => {
  it('rejects booking a locker that belongs to another branch', async () => {
    const create = jest.fn();
    const service = makeService({
      club_lockers: { findUnique: jest.fn().mockResolvedValue({ id: 12, main_branch_id: 4, sub_branch_id: 4, is_available: true }) },
      club_locker_subscription_types: { findUnique: jest.fn() },
      club_locker_subscriptions: { create },
    });
    await expect(service.createSubscription({
      lockerId: 12, subscriptionTypeId: 4, customerName: 'Asmaa', mainBranchId: 3, subBranchId: 3, paidAmount: 0,
    }, 5, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });

  it('stores the locker branch, not the client-supplied branch ids', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 1, ...data }));
    const service = makeService({
      club_lockers: { findUnique: jest.fn().mockResolvedValue({ id: 12, main_branch_id: 3, sub_branch_id: 7, is_available: true }), update: jest.fn() },
      club_locker_subscription_types: { findUnique: jest.fn().mockResolvedValue({ id: 4, name: 'شهري', meta_value: 300, days: 30, branch_id: null }) },
      club_locker_subscriptions: { create },
    });
    await service.createSubscription({
      lockerId: 12, subscriptionTypeId: 4, customerName: 'Asmaa', mainBranchId: 9, subBranchId: 9,
      subscriptionStartDate: '2026-10-29', paidAmount: 0,
    }, 5, branchUser);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ main_branch_id: 3, sub_branch_id: 7 }) });
  });

  it('rejects a locker subscription for a member outside the user branch', async () => {
    const service = makeService({
      club_lockers: { findUnique: jest.fn().mockResolvedValue({ id: 12, main_branch_id: 3, sub_branch_id: 3, is_available: true }) },
      club_locker_subscription_types: { findUnique: jest.fn().mockResolvedValue({ id: 4, meta_value: 300, days: 30, branch_id: null }) },
      club_members: { findUnique: jest.fn().mockResolvedValue({ branch_id: 4, gender: 'male' }) },
      club_locker_subscriptions: { create: jest.fn() },
    });
    await expect(service.createSubscription({
      lockerId: 12, subscriptionTypeId: 4, memberId: 8, customerName: 'Ali', paidAmount: 0,
    }, 5, branchUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['release', 'remove', 'unfreeze'])('blocks %s on a foreign-branch locker subscription', async (action) => {
    const update = jest.fn();
    const del = jest.fn();
    const service = makeService({
      club_locker_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({ id: 40, main_branch_id: 4, gender: 'male', member_id: null, locker_id: 12, status: 'frozen' }),
        update,
        delete: del,
      },
    });
    const call = action === 'release'
      ? service.releaseSubscription(40, branchUser)
      : action === 'remove'
        ? service.removeSubscription(40, branchUser)
        : service.unfreezeSubscription(40, false, branchUser);
    await expect(call).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('lets a women-only employee release a men section subscription in their branch', async () => {
    const update = jest.fn();
    const lockerUpdate = jest.fn();
    const service = makeService({
      club_locker_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({ id: 40, main_branch_id: 3, gender: 'male', member_id: null, locker_id: 12 }),
        findMany: jest.fn().mockResolvedValue([]),
        update,
      },
      club_lockers: { update: lockerUpdate },
    });
    await expect(service.releaseSubscription(40, { sub: 5, level: 2, branch: 3, man_women_type: 2 } as never))
      .resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 40 }, data: expect.objectContaining({ status: 'expired' }) }));
    expect(lockerUpdate).toHaveBeenCalledWith({ where: { id: 12 }, data: { is_available: true } });
  });
});
