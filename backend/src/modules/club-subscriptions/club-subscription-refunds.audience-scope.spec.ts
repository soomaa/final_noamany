import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';

describe('ClubSubscriptionRefundsService canonical audience scope', () => {
  const subscription = {
    id: 7,
    branch_id: 5,
    member_id: 11,
    gender: null,
    customer_name: 'عضو قديم',
    subscription_start_date: '2026-09-01',
    subscription_end_date: '2026-09-30',
    subscription_value: 300,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 300,
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
    member: { gender: 'male', is_deleted: false },
  };
  const prisma = {
    club_subscription_refunds: {
      findMany: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: 0 } }),
    },
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue(subscription) },
  };
  const service = new ClubSubscriptionRefundsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    new BranchScopeService(),
  );
  const menUser = { sub: 9, level: 3, branch: 5, man_women_type: 0 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscriptions.findUnique.mockResolvedValue(subscription);
    prisma.club_subscription_refunds.aggregate.mockResolvedValue({ _sum: { refund_amount: 0 } });
  });

  it('lists refunds through the linked canonical member rather than the stale snapshot', async () => {
    await service.list(menUser);
    expect(prisma.club_subscription_refunds.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        subscription: { member: { is: { is_deleted: false, gender: 'male' } } },
      }),
    }));
  });

  it('allows a legacy null-snapshot subscription when its canonical member matches', async () => {
    await expect(service.computePreview({ subscriptionId: 7, stopDate: '2026-09-15' }, menUser))
      .resolves.toMatchObject({ subscriptionId: 7, customerName: 'عضو قديم' });
    expect(prisma.club_subscriptions.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { member: { select: { gender: true, is_deleted: true } } },
    }));
  });

  it('rejects an opposite canonical member even when the snapshot is null', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValue({
      ...subscription,
      member: { gender: 'female', is_deleted: false },
    });
    await expect(service.computePreview({ subscriptionId: 7, stopDate: '2026-09-15' }, menUser))
      .rejects.toThrow('لا تملك صلاحية الوصول لبيانات هذا القسم');
  });

  it('rechecks canonical audience after the refund subscription row lock', async () => {
    const pendingRefund = {
      id: 21,
      subscription_id: 7,
      status: 'pending',
      refund_amount: 50,
      refund_date: '2026-09-09',
      stop_date: '2026-09-15',
      subscription: { branch_id: 5, member: { gender: 'male', is_deleted: false } },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({
          ...subscription,
          member: { gender: 'female', is_deleted: false },
        }),
      },
      club_subscription_refunds: {
        aggregate: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const isolatedPrisma = {
      club_subscription_refunds: {
        findUnique: jest.fn().mockResolvedValue(pendingRefund),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const isolated = new ClubSubscriptionRefundsService(
      isolatedPrisma as never,
      {} as never,
      {} as never,
      {} as never,
      new BranchScopeService(),
    );

    await expect(isolated.updateStatus(21, 'completed', 9, menUser))
      .rejects.toThrow('لا تملك صلاحية الوصول لبيانات هذا القسم');
    expect(tx.club_subscription_refunds.aggregate).not.toHaveBeenCalled();
    expect(tx.club_subscription_refunds.updateMany).not.toHaveBeenCalled();
  });
});
