import { assertSubscriptionNotTransferred, assertSubscriptionCanBeDeleted } from './transferred-subscription-guard';
import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('transferred subscription source protection', () => {
  it('blocks the reopened 4119 shape, zero-credit plan transfers and member transfers', () => {
    expect(() => assertSubscriptionNotTransferred({ transferred_out_amount: '323.08' })).toThrow('تم تحويل');
    expect(() => assertSubscriptionNotTransferred({ transferred_out_amount: 0, _count: { plan_transfers_out: 1 } })).toThrow('تم تحويل');
    expect(() => assertSubscriptionNotTransferred({ member_transfer_source: { id: 1 } })).toThrow('تم تحويل');
    expect(() => assertSubscriptionNotTransferred({ transferred_out_amount: 0, _count: { plan_transfers_out: 0 } })).not.toThrow();
  });

  it('rejects editing a transferred source before any contract or payment mutation', async () => {
    const prisma = { club_subscriptions: { findUnique: jest.fn().mockResolvedValue({ id: 16211, branch_id: 1, transferred_out_amount: 323.08 }) }, $transaction: jest.fn() };
    const service = Object.create(ClubSubscriptionsService.prototype) as ClubSubscriptionsService;
    Object.assign(service, { prisma, branchScope: { isBranchAllowed: () => true } });
    await expect(service.update(16211, { subscriptionTypeId: 61, sessionsCount: 26, subscriptionValue: 600 })).rejects.toThrow('تم تحويل');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('subscription deletion history protection', () => {
  it('protects both ends of zero-credit plan and member transfers', () => {
    for (const sub of [
      { _count: { plan_transfers_out: 1, plan_transfers_in: 0 } },
      { _count: { plan_transfers_out: 0, plan_transfers_in: 1 } },
      { member_transfer_source: { id: 1 } },
      { member_transfer_destination: { id: 1 } },
    ]) expect(() => assertSubscriptionCanBeDeleted(sub)).toThrow('مرتبط بتحويل');
    expect(() => assertSubscriptionCanBeDeleted({})).not.toThrow();
  });

  function fixture() {
    const sub = { id: 42, branch_id: 1 };
    const tx = {
      $queryRaw: jest.fn(),
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(sub), delete: jest.fn() },
      club_receipts: { count: jest.fn().mockResolvedValue(0) },
      club_subscription_refunds: { count: jest.fn().mockResolvedValue(0) },
      club_subscription_freezes: { deleteMany: jest.fn() },
    };
    const prisma = { club_subscriptions: { findUnique: jest.fn().mockResolvedValue(sub) }, $transaction: jest.fn().mockImplementation(fn => fn(tx)) };
    const service = Object.create(ClubSubscriptionsService.prototype) as ClubSubscriptionsService;
    Object.assign(service, { prisma, branchScope: { isBranchAllowed: () => true }, audit: { log: jest.fn() } });
    return { service, prisma, tx };
  }

  it('stops an already-linked subscription before attempting a transaction', async () => {
    const { service, prisma, tx } = fixture();
    prisma.club_subscriptions.findUnique.mockResolvedValue({ id: 42, branch_id: 1, _count: { plan_transfers_out: 0, plan_transfers_in: 1 } } as any);
    await expect(service.remove(42)).rejects.toThrow('مرتبط بتحويل');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.club_subscriptions.delete).not.toHaveBeenCalled();
  });

  it('rechecks transfer links after locking so a concurrent transfer cannot be deleted', async () => {
    const { service, tx } = fixture();
    tx.club_subscriptions.findUnique.mockResolvedValue({ id: 42, branch_id: 1, member_transfer_destination: { id: 1 } } as any);
    await expect(service.remove(42)).rejects.toThrow('مرتبط بتحويل');
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.club_subscription_freezes.deleteMany).not.toHaveBeenCalled();
    expect(tx.club_subscriptions.delete).not.toHaveBeenCalled();
  });

  it('preserves even cancelled refund history', async () => {
    const { service, tx } = fixture();
    tx.club_subscription_refunds.count.mockResolvedValue(1);
    await expect(service.remove(42)).rejects.toThrow('سجل المدفوعات');
    expect(tx.club_subscription_refunds.count).toHaveBeenCalledWith({ where: { subscription_id: 42 } });
    expect(tx.club_subscriptions.delete).not.toHaveBeenCalled();
  });

  it('turns an unanticipated foreign-key dependency into a useful business error', async () => {
    const { service, tx } = fixture();
    tx.club_subscriptions.delete.mockRejectedValue({ code: 'P2003' });
    await expect(service.remove(42)).rejects.toThrow('مرتبط بسجلات أخرى');
  });
});
