import { membershipStanding, standingRank } from './member-login-membership';

const today = '2026-09-14';
const period = (overrides = {}) => ({
  branch_id: 1, subscription_start_date: '2026-09-01', subscription_end_date: '2026-10-01',
  status: 'active', is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
  ...overrides,
});
const member = (subscriptions: ReturnType<typeof period>[] = [], branch_id = 1) => ({ branch_id, subscriptions });

describe('membership standing (branch picker)', () => {
  it('is active for a current period and reports its end date', () => {
    expect(membershipStanding(member([period()]), today)).toEqual({ standing: 'active', endsAt: '2026-10-01' });
  });
  it('treats an expired period as expired even if its stored status is still active', () => {
    expect(membershipStanding(member([period({ subscription_end_date: '2026-09-13' })]), today).standing).toBe('expired');
  });
  it('includes the end day and ignores exhausted session packages', () => {
    expect(membershipStanding(member([period({ subscription_end_date: today })]), today).standing).toBe('active');
    expect(membershipStanding(member([period({ is_linked_to_sessions: true, sessions_count: 5, sessions_used: 5 })]), today).standing).toBe('expired');
  });
  it('never reads a frozen membership as active', () => {
    expect(membershipStanding(member([period({ status: 'frozen' })]), today).standing).toBe('frozen');
  });
  it('recognises an upcoming period', () => {
    expect(membershipStanding(member([period({ subscription_start_date: '2026-09-20' })]), today).standing).toBe('upcoming');
  });
  it('only counts subscriptions of the membership’s own branch', () => {
    expect(membershipStanding(member([period({ branch_id: 2 })]), today).standing).toBe('none');
  });
  it('reports the latest end date among expired periods', () => {
    const result = membershipStanding(member([
      period({ subscription_end_date: '2026-05-01' }),
      period({ subscription_end_date: '2026-08-01' }),
    ]), today);
    expect(result).toEqual({ standing: 'expired', endsAt: '2026-08-01' });
  });
  it('ranks usable memberships first', () => {
    const order = (['none', 'expired', 'active', 'upcoming', 'frozen'] as const)
      .slice().sort((a, b) => standingRank(b) - standingRank(a));
    expect(order).toEqual(['active', 'frozen', 'upcoming', 'expired', 'none']);
  });
});
