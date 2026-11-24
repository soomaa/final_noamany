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

describe('EntitlementService active plan at another branch (client, 24 Nov)', () => {
  const activeAt = (branchId: number) => ({
    id: 42019, subscription_number: 'SUB-42019', subscription_type: '3 شهور شامل سبا', status: 'active',
    subscription_start_date: '2026-01-01', subscription_end_date: '2099-02-16', remaining_amount: 0,
    is_time_based: false, time_from: null, time_to: null, is_linked_to_sessions: false,
    is_special: false, special_class_type_id: null, sessions_count: 0, sessions_used: 0,
    allow_multiple_daily_entries: true, branch_id: branchId,
  });
  const expiredAt = (branchId: number) => ({ ...activeAt(branchId), id: 10255, status: 'expired', subscription_start_date: '2025-07-17', subscription_end_date: '2025-09-14' });
  const member = { id: 12710, member_code: 'B1', name: 'عضو', phone: null, branch_id: 3, is_active: true, is_blocked: false, block_reason: null };
  const policies = { get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: true, outstandingAlertEnabled: false }) };

  it('accepts a member of البر الشرقي whose active plan is booked at الجلاء when both are in one group', async () => {
    const findMany = jest.fn(async ({ where }: { where: { branch_id?: { in?: number[] } } }) =>
      [activeAt(4), expiredAt(3)].filter((s) => !where.branch_id?.in || where.branch_id.in.includes(s.branch_id)));
    const prisma = { club_members: { findFirst: jest.fn().mockResolvedValue(member) }, club_subscriptions: { findMany } };
    const service = new EntitlementService(prisma as never, policies as never);
    const result = await service.validate({ memberId: 12710, branchId: 3, branchIds: [3, 4] });
    expect(result.allowed).toBe(true);
  });

  it('says the plan is at another branch instead of «لا يوجد اشتراك نشط» outside the group', async () => {
    const findMany = jest.fn(async ({ where }: { where: { branch_id?: { in?: number[]; notIn?: number[] } } }) =>
      [activeAt(2), expiredAt(3)].filter((s) =>
        (!where.branch_id?.in || where.branch_id.in.includes(s.branch_id)) &&
        (!where.branch_id?.notIn || !where.branch_id.notIn.includes(s.branch_id))));
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_subscriptions: { findMany },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_name: 'فرع طنطا' }) },
    };
    const service = new EntitlementService(prisma as never, policies as never);
    const result = await service.validate({ memberId: 12710, branchId: 3, branchIds: [3] });
    expect(result.allowed).toBe(false);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('subscription_other_branch');
    expect(codes).not.toContain('no_active_subscription');
    expect(result.reasons.find((r) => r.code === 'subscription_other_branch')?.messageAr ?? JSON.stringify(result.reasons)).toContain('فرع طنطا');
  });
});
