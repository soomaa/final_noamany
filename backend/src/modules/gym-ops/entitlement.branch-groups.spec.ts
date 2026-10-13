import { EntitlementService } from './entitlement.service';

describe('EntitlementService branch-group scope', () => {
  it('accepts an active subscription from a sibling branch when the caller supplies the group scope', async () => {
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 10, member_code: 'E100', name: 'عضو البر الشرقي', phone: null, branch_id: 2, is_active: true, is_blocked: false, block_reason: null }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{
        id: 44, subscription_number: 'SUB-44', subscription_type: 'اشتراك شهري', status: 'active',
        subscription_start_date: '2026-01-01', subscription_end_date: '2027-12-31', remaining_amount: 0,
        is_time_based: false, time_from: null, time_to: null, is_linked_to_sessions: false,
        is_special: false, special_class_type_id: null, sessions_count: null, sessions_used: 0,
        allow_multiple_daily_entries: true, branch_id: 2,
      }]) },
    };
    const policies = { get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: false, outstandingAlertEnabled: false, outstandingAlertAfterSubscriptionPercent: 50 }) };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({ memberId: 10, branchId: 3, branchIds: [2, 3], subscriptionId: 44 });

    expect(result.allowed).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).not.toContain('subscription_branch_mismatch');
  });

  it('accepts an active Tanta section subscription for a member stored under Tanta main', async () => {
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue({ id: 10, member_code: 'C10', name: 'عضو', phone: null, branch_id: 2, is_active: true, is_blocked: false }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{
        id: 50, subscription_number: 'SUB-50', subscription_type: 'اشتراك عادي', status: 'active',
        subscription_start_date: '2020-01-01', subscription_end_date: '2099-12-31', remaining_amount: 0,
        is_time_based: false, time_from: null, time_to: null, is_linked_to_sessions: false,
        is_special: false, special_class_type_id: null, sessions_count: 0, sessions_used: 0,
        allow_multiple_daily_entries: true, branch_id: 5,
      }]) },
    };
    const policies = { get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: true, outstandingAlertEnabled: false }) };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({ memberId: 10, branchId: 2, branchIds: [2, 5, 6] });

    expect(result.allowed).toBe(true);
    expect(result.activeSubscription?.id).toBe(50);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: 10, branch_id: { in: [2, 5, 6] } },
    }));
  });
});
