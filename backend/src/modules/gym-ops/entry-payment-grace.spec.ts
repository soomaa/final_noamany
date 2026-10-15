import { EntitlementService } from './entitlement.service';
import { ClubGymPoliciesService } from './club-gym-policies.service';

describe('entry expiry and payment grace policy', () => {
  const at = new Date('2026-10-08T10:00:00Z');
  const sub = { id: 1, subscription_number: 'TEST-1', subscription_type: 'monthly', status: 'active',
    subscription_start_date: '2026-10-01', subscription_end_date: '2026-10-31', remaining_amount: 100,
    branch_id: 1, is_time_based: false, time_from: null, time_to: null, is_linked_to_sessions: false,
    is_special: false, special_class_type_id: null, sessions_count: null, sessions_used: 0,
    allow_multiple_daily_entries: true };
  function setup(overrides = {}, policyOverrides = {}) {
    const db = { club_members: { findFirst: jest.fn().mockResolvedValue({ id: 1, branch_id: 1,
      member_code: 'TEST', name: 'Demo', is_active: true, is_blocked: false }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([{ ...sub, ...overrides }]) } };
    const policies = { get: jest.fn().mockResolvedValue({ allowCheckInWithOutstanding: true,
      outstandingGraceDays: 7, outstandingAlertEnabled: true, outstandingAlertAfterSubscriptionPercent: 90,
      outstandingBlockAfterSubscriptionPercent: null, allowGraceSessions: true, ...policyOverrides }) };
    return { service: new EntitlementService(db as never, policies as never), db, policies };
  }
  it('warns from the first entry during the grace period even if the old percentage is 90', async () => {
    const { service } = setup();
    const result = await service.validate({ memberId: 1, branchId: 1, at: new Date('2026-10-02T10:00:00Z') });
    expect(result.allowed).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'outstanding_balance', severity: 'warn' })]);
    expect(result.warnings[0].messageAr).toContain('6 يوم');
    expect(result.accessValidUntil).toBe('2026-10-07');
  });
  it('blocks on day seven with balance and elapsed days, even with warnings disabled', async () => {
    const { service } = setup({}, { outstandingAlertEnabled: false });
    const result = await service.validate({ memberId: 1, branchId: 1, at });
    expect(result.allowed).toBe(false);
    expect(result.allowGraceSessions).toBe(false);
    expect(result.reasons[0].messageAr).toContain('100');
    expect(result.reasons[0].messageAr).toContain('7 يوم');
  });
  it('uses Cairo midnight across UTC dates for the deadline', async () => {
    const { service } = setup();
    const before = await service.validate({ memberId: 1, at: new Date('2026-10-07T20:59:00Z') });
    const after = await service.validate({ memberId: 1, at: new Date('2026-10-07T21:01:00Z') });
    expect(before.allowed).toBe(true);
    expect(after.allowed).toBe(false);
  });
  it('zero days blocks immediately and disabling outstanding entry stays authoritative', async () => {
    for (const policy of [{ outstandingGraceDays: 0 }, { allowCheckInWithOutstanding: false }]) {
      const { service } = setup({}, policy);
      expect((await service.validate({ memberId: 1, at: new Date('2026-10-01T10:00:00Z') })).allowed).toBe(false);
    }
  });
  it('cannot loosen the administrator policy using blockOnOutstanding=false', async () => {
    const { service } = setup({}, { allowCheckInWithOutstanding: false });
    const result = await service.validate({ memberId: 1, branchId: 1,
      at: new Date('2026-10-02T10:00:00Z'), blockOnOutstanding: false });
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'outstanding_balance' })]));
  });
  it('counts calendar payment days across Cairo daylight saving time', async () => {
    const { service } = setup({ subscription_start_date: '2026-10-23', subscription_end_date: '2026-11-30' });
    const result = await service.validate({ memberId: 1, branchId: 1, at: new Date('2026-10-30T10:00:00Z') });
    expect(result.allowed).toBe(false);
    expect(result.reasons[0].messageAr).toContain('7 يوم');
    expect(result.accessValidUntil).toBe('2026-10-29');
  });
  it('allows a paid member after the deadline and removes the offline payment cutoff', async () => {
    const { service } = setup({ remaining_amount: 0 });
    const result = await service.validate({ memberId: 1, at });
    expect(result.allowed).toBe(true);
    expect(result.accessValidUntil).toBe('2026-10-31');
  });
  it.each([{ subscription_end_date: '2026-10-07' }, { status: 'expired' },
    { status: 'frozen' }, { is_linked_to_sessions: true, sessions_count: 2, sessions_used: 2 }])(
    'blocks an unusable selected subscription: %j', async (override) => {
      const { service } = setup({ ...override, remaining_amount: 0 });
      expect((await service.validate({ memberId: 1, subscriptionId: 1, at })).allowed).toBe(false);
    });
  it('denies an expired subscription without offering a reception grace override', async () => {
    const { service } = setup({ subscription_end_date: '2026-10-07', remaining_amount: 0 });
    const result = await service.validate({ memberId: 1, at });
    expect(result.allowed).toBe(false);
    expect(result.allowGraceSessions).toBe(false);
    expect(result.reasons.map((r) => r.code)).toContain('no_active_subscription');
  });
  it('loads policy, member and subscriptions once for multiple packages', async () => {
    const { service, db, policies } = setup({ remaining_amount: 0 });
    db.club_subscriptions.findMany.mockResolvedValue([{ ...sub, remaining_amount: 0 }, { ...sub, id: 2, remaining_amount: 0 }]);
    expect(await service.usableSubscriptions({ memberId: 1, branchId: 1, at })).toHaveLength(2);
    expect(db.club_members.findFirst).toHaveBeenCalledTimes(1);
    expect(db.club_subscriptions.findMany).toHaveBeenCalledTimes(1);
    expect(policies.get).toHaveBeenCalledTimes(1);
  });
  it('validates a policy update before writing or even initializing policies', async () => {
    const get = jest.fn();
    const service = new ClubGymPoliciesService({ club_gym_policies: { findUnique: get } } as never);
    for (const days of [-1, 366, 2.5, NaN]) await expect(service.update({ outstandingGraceDays: days })).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
});
