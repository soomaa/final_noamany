import { EntitlementService } from './entitlement.service';

const sub = (over: Record<string, unknown>) => ({
  id: 1, subscription_number: 'S-1', subscription_type: 'شهري', status: 'active',
  subscription_start_date: '2020-01-01', subscription_end_date: '2099-01-01',
  remaining_amount: 0, is_time_based: false, time_from: null, time_to: null,
  is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
  is_special: false, special_class_type_id: null, allow_multiple_daily_entries: false,
  branch_id: 1, member_id: 10,
  ...over,
});

function service(subs: unknown[]) {
  const prisma = {
    club_members: { findFirst: jest.fn().mockResolvedValue({ id: 10, member_code: 'B868', name: 'عضو', phone: null, branch_id: 1, is_active: true, is_blocked: false }) },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue(subs) },
  };
  const policies = { get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: true }) };
  return new EntitlementService(prisma as never, policies as never);
}

describe('EntitlementService with a frozen subscription (22 Nov)', () => {
  it('lets the member in on another running plan even when the frozen one ends later', async () => {
    const result = await service([
      sub({ id: 2, status: 'frozen', subscription_end_date: '2099-12-31' }), // freeze pushed its end out
      sub({ id: 3, status: 'active', subscription_end_date: '2099-06-01' }),
    ]).validate({ memberId: 10, branchId: 1 });
    expect(result.activeSubscription?.id).toBe(3);
    expect(result.reasons.map((r) => r.code)).not.toContain('subscription_frozen');
  });

  it('still refuses with «الاشتراك مجمد» when the frozen plan is the only running one', async () => {
    const result = await service([sub({ id: 2, status: 'frozen' })]).validate({ memberId: 10, branchId: 1 });
    expect(result.allowed).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain('subscription_frozen');
  });
});
