import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays } from './club-subscription.utils';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';

describe('refund group access and financial ownership', () => {
  const user = { sub: 11, level: 2, branch: 3, man_women_type: 3 } as JwtUser;
  const today = localDateString();
  const sub = { id: 22, branch_id: 7, subscription_start_date: addDays(today, -5), subscription_end_date: addDays(today, 25), subscription_value: 300, paid_amount: 300, discount_enabled: false, discount_value: 0, is_linked_to_sessions: false };
  const prisma = { club_subscriptions: { findUnique: jest.fn().mockResolvedValue(sub) }, club_subscription_refunds: { aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: 0 } }), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() } };
  const groups = { siblingBranchIds: jest.fn().mockResolvedValue([3, 7]) };
  const service = new ClubSubscriptionRefundsService(prisma as never, {} as never, {} as never, {} as never, new BranchScopeService(), groups);
  beforeEach(() => { groups.siblingBranchIds.mockResolvedValue([3, 7]); prisma.club_subscriptions.findUnique.mockResolvedValue(sub); });

  it('permits a refund preview for a sibling subscription without changing its branch', async () => {
    await expect(service.computePreview({ subscriptionId: 22, stopDate: today }, user)).resolves.toMatchObject({ subscriptionId: 22, paidAmount: 300 });
    expect(sub.branch_id).toBe(7);
    await service.list(user);
    expect(prisma.club_subscription_refunds.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ branch_id: { in: [3, 7] } }) }));
  });

  it('rejects a subscription from another or inactive group before reading its paid cap', async () => {
    groups.siblingBranchIds.mockResolvedValue([3]);
    await expect(service.computePreview({ subscriptionId: 22, stopDate: today }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps reception refund history available for past dates after the daily-only request was cancelled', async () => {
    const receptionist = { ...user, job_title: 'موظف استقبال' };
    await service.list(receptionist);
    expect(prisma.club_subscription_refunds.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: { not: 'cancelled' }, branch_id: { in: [3, 7] } } }));
    await service.statistics(receptionist);
    expect(prisma.club_subscription_refunds.findMany).toHaveBeenLastCalledWith({ where: { branch_id: { in: [3, 7] } } });
    await expect(service.computePreview({ subscriptionId: 22, stopDate: today }, receptionist)).resolves.toMatchObject({ subscriptionId: 22 });
    prisma.club_subscription_refunds.findUnique.mockResolvedValue({ branch_id: 7, refund_date: '2000-01-01' });
    await expect(service.findOne(99, receptionist)).resolves.toMatchObject({ branchId: 7, refundDate: '2000-01-01' });
  });
});
