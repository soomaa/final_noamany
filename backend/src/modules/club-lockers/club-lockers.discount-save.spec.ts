import { ClubLockersService } from './club-lockers.service';

describe('ClubLockersService locker subscription discounts', () => {
  it('consumes the selected member grant when saving a locker subscription', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 11, ...data }));
    const prisma: any = {
      club_locker_subscription_types: { findUnique: jest.fn().mockResolvedValue({ id: 4, name: 'شهري لوكر', meta_value: 300, days: 30 }) },
      club_lockers: { findUnique: jest.fn().mockResolvedValue({ id: 12, is_available: true }), update: jest.fn() },
      club_members: { findUnique: jest.fn().mockResolvedValue({ member_code: 'M-8' }) },
      club_locker_subscriptions: { create },
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(prisma)),
    };
    const discountCodes = {
      resolveMemberGrant: jest.fn().mockResolvedValue({ discountEnabled: true, discountCodeId: 7, discountPercentage: 10, discountValue: 30 }),
      consumeMemberGrant: jest.fn().mockResolvedValue({ discountValue: 30 }),
    };
    const service = new (ClubLockersService as any)(prisma, {} as any, {} as any, discountCodes, {} as any);
    (service as any).generateLockNumber = jest.fn().mockResolvedValue('L-000003');

    await service.createSubscription({
      mainBranchId: 1, subBranchId: 1, memberId: 8, customerName: 'Asmaa', subscriptionTypeId: 4,
      lockerId: 12, subscriptionStartDate: '2026-09-22', paidAmount: 0,
      memberDiscountGrantId: 22, gender: 'female',
    }, 5);

    expect(discountCodes.consumeMemberGrant).toHaveBeenCalledWith(expect.objectContaining({
      grantId: 22, memberId: 8, subscriptionId: 11, subscriptionValue: 300, publisher: 5,
    }), prisma);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { maxWait: 10000, timeout: 15000 },
    );
  });

  it('does not accept a catalog code that was not granted to the member', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 9, ...data }));
    const prisma: any = {
      club_locker_subscription_types: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, meta_value: 300, days: 30 }),
      },
      club_lockers: {
        findUnique: jest.fn().mockResolvedValue({ id: 12, is_available: true }),
        update: jest.fn(),
      },
      club_locker_subscriptions: { create },
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(prisma)),
    };
    const service = new ClubLockersService(prisma, {} as any, {} as any, {} as any, {} as any);
    (service as any).generateLockNumber = jest.fn().mockResolvedValue('L-000001');

    await expect(service.createSubscription({
      mainBranchId: 1,
      subBranchId: 1,
      customerName: 'Asmaa',
      subscriptionTypeId: 4,
      lockerId: 12,
      subscriptionStartDate: '2026-09-22',
      paidAmount: 0,
      discountEnabled: true,
      discountValue: 30,
      discountCodeId: 7,
      discountPercentage: 10,
      gender: 'female',
    }, 1)).rejects.toThrow('كود خصم اللوكر يجب أن يكون ممنوحًا لعضو محدد');
  });

  it('does not write null legacy discount fields when no code is selected', async () => {
    const create = jest.fn(async ({ data }) => ({ id: 10, ...data }));
    const prisma: any = {
      club_locker_subscription_types: { findUnique: jest.fn().mockResolvedValue({ id: 4, meta_value: 300, days: 30 }) },
      club_lockers: { findUnique: jest.fn().mockResolvedValue({ id: 12, is_available: true }), update: jest.fn() },
      club_locker_subscriptions: { create },
      $transaction: jest.fn(async (work: (tx: any) => unknown) => work(prisma)),
    };
    const service = new ClubLockersService(prisma, {} as any, {} as any, {} as any, {} as any);
    (service as any).generateLockNumber = jest.fn().mockResolvedValue('L-000002');

    await service.createSubscription({
      mainBranchId: 1, subBranchId: 1, customerName: 'Asmaa', subscriptionTypeId: 4,
      lockerId: 12, subscriptionStartDate: '2026-09-22', paidAmount: 0,
      discountEnabled: true, discountValue: 30, gender: 'female',
    }, 1);

    const saved = create.mock.calls[0][0].data;
    expect(saved).not.toHaveProperty('discount_code_id');
    expect(saved).not.toHaveProperty('discount_percentage');
  });
});
