import { EntitlementService } from './entitlement.service';

const activeSessionSubscription = {
  id: 91,
  subscription_number: 'SUB-91',
  subscription_type: 'Zumba 8 sessions',
  status: 'active',
  subscription_start_date: '2020-01-01',
  subscription_end_date: '2098-12-31',
  remaining_amount: 0,
  is_time_based: false,
  time_from: null,
  time_to: null,
  is_linked_to_sessions: true,
  is_special: true,
  special_class_type_id: 7,
  sessions_count: 8,
  sessions_used: 3,
  allow_multiple_daily_entries: false,
  branch_id: 1,
};

describe('EntitlementService member activity reconciliation', () => {
  it('allows a stale inactive member when a live session package still has sessions', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          member_code: '4837',
          name: 'Session member',
          phone: null,
          branch_id: 1,
          is_active: false,
          is_blocked: false,
        }),
      },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([activeSessionSubscription]),
      },
    };
    const policies = {
      get: jest.fn().mockResolvedValue({
        allowCheckInWithOutstanding: false,
        allowGraceSessions: false,
        outstandingAlertEnabled: false,
      }),
    };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({
      memberId: 10,
      branchId: 1,
      subscriptionId: 91,
    });

    expect(result.allowed).toBe(true);
    expect(result.member.isActive).toBe(true);
    expect(result.activeSubscription?.sessionsRemaining).toBe(5);
    expect(result.reasons.map((reason) => reason.code)).not.toContain('member_inactive');
  });

  it('still blocks an inactive member when no subscription is usable', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          member_code: '4837',
          name: 'Inactive member',
          phone: null,
          branch_id: 1,
          is_active: false,
          is_blocked: false,
        }),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const policies = {
      get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: false }),
    };
    const service = new EntitlementService(prisma as never, policies as never);

    const result = await service.validate({ memberId: 10, branchId: 1 });

    expect(result.allowed).toBe(false);
    expect(result.member.isActive).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain('member_inactive');
  });
});
