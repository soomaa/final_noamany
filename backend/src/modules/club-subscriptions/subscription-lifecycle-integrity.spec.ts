import { assertCanFreeze, freezeAllowance, normalizedFreezeDays, renewalQueue, thawPeriod } from './freeze-integrity';
import { daysBetween, resolveSubscriptionEndDate } from './club-subscription.utils';
import { purchasedBenefits, captureBenefits } from './purchased-benefits';

const benefits = { version: 1, inbody_count: 3, includes_spa: true, spa_count: 2, is_linked_to_freeze: true, freeze_days: 2, freeze_total_days: 14 };
function fixture() {
  const source = { id: 1, member_id: 10, branch_id: 2, subscription_type_id: 7, subscription_start_date: '2026-10-01', subscription_end_date: '2026-10-30', status: 'frozen', sessions_used: 0, is_linked_to_sessions: false, purchased_benefits: benefits };
  const next = { ...source, id: 2, subscription_start_date: '2026-10-31', subscription_end_date: '2026-11-29', renewed_from_subscription_id: 1, status: 'frozen', renewal_hold: true };
  const third = { ...next, id: 3, subscription_start_date: '2026-11-30', subscription_end_date: '2026-12-29', renewed_from_subscription_id: 2 };
  const rows: any[] = [source, next, third];
  const freezes: any[] = [{ id: 1, subscription_id: 1, freeze_start_date: '2026-10-09', freeze_end_date: '2026-10-16', original_end_date: '2026-10-30', planned_days: 7, is_active: true }];
  const client: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    club_subscription_types: { findUnique: jest.fn().mockResolvedValue({ inbody_count: 0, is_linked_to_freeze: false, freeze_total_days: 0 }) },
    club_subscriptions: {
      findUnique: jest.fn(async ({ where }) => rows.find(row => where.id ? row.id === where.id : row.renewed_from_subscription_id === where.renewed_from_subscription_id) ?? null),
      update: jest.fn(async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data)),
    },
    club_subscription_freezes: {
      findMany: jest.fn(async ({ where }) => freezes.filter(row => row.subscription_id === where.subscription_id)),
      update: jest.fn(async ({ where, data }) => Object.assign(freezes.find(row => row.id === where.id), data)),
    },
  };
  return { client, rows, freezes };
}

describe('subscription contract and lifecycle regression', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-20T09:00:00Z')));
  afterEach(() => jest.useRealTimers());
  it('uses calendar dates across Cairo DST and inclusive sold durations', () => {
    expect(daysBetween('2026-10-29', '2026-10-30')).toBe(1);
    expect(resolveSubscriptionEndDate('2026-10-01', 30, false)).toBe('2026-10-30');
    expect(resolveSubscriptionEndDate('2026-10-01', 1, false)).toBe('2026-10-01');
    expect(resolveSubscriptionEndDate('2026-10-01', 30, true)).toBe('2026-10-30');
  });
  it('keeps purchased wellness and freeze rights after catalog edits', async () => {
    const { client, rows } = fixture();
    expect(purchasedBenefits(rows[0], { inbody_count: 0 }).inbody_count).toBe(3);
    expect((await freezeAllowance(client, rows[0])).remainingDays).toBe(14);
    expect((await freezeAllowance(client, rows[0])).policy.is_linked_to_freeze).toBe(true);
  });
  it('captures class and wellness rights for the next sale', async () => {
    const { client } = fixture();
    client.club_subscription_types.findUnique.mockResolvedValue({ class_types: [{ class_type_id: 4 }], inbody_count: 2, is_linked_to_freeze: true });
    expect(await captureBenefits(client, 7)).toMatchObject({ version: 1, classTypeIds: [4], inbody_count: 2 });
  });
  it('thaws at the agreed date after a late scheduler and shifts every renewal without overlap', async () => {
    const { client, rows, freezes } = fixture();
    const result = await thawPeriod(client, 1, () => {}, true);
    expect(result?.actualDays).toBe(7);
    expect(rows[0].subscription_end_date).toBe('2026-11-06');
    expect(rows[1]).toMatchObject({ subscription_start_date: '2026-11-07', subscription_end_date: '2026-12-06', renewal_hold: false, status: 'upcoming' });
    expect(rows[2]).toMatchObject({ subscription_start_date: '2026-12-07', subscription_end_date: '2027-01-05', renewal_hold: false });
    expect(freezes[0]).toMatchObject({ actual_days: 7, freeze_end_date: '2026-10-16', is_active: false });
    expect(await thawPeriod(client, 1, () => {}, true)).toBeNull();
  });
  it('does not thaw before the planned end', async () => {
    const { client, freezes } = fixture(); freezes[0].freeze_end_date = '2026-10-25';
    expect(await thawPeriod(client, 1, () => {}, true)).toBeNull();
    expect(client.club_subscriptions.update).not.toHaveBeenCalled();
  });
  it('does not allow a queued hold to be thawed independently', async () => {
    const { client } = fixture(); await expect(thawPeriod(client, 2, () => {})).rejects.toThrow('الاشتراك السابق');
  });
  it('rejects a chain that crosses member ownership', async () => {
    const { client, rows } = fixture(); rows[1].member_id = 99;
    await expect(renewalQueue(client, rows[0])).rejects.toThrow('سلسلة التجديد');
  });
  it('refuses duplicate freezes and malformed planned days', async () => {
    const { client, rows } = fixture(); rows[0].status = 'active';
    await expect(assertCanFreeze(client, 1, 3, () => {})).rejects.toThrow('تجميد نشط');
    expect(() => normalizedFreezeDays(-3)).toThrow(); expect(() => normalizedFreezeDays(1.5)).toThrow();
    expect(normalizedFreezeDays(0)).toBe(0);
  });
  it('refuses exhausted session packs even while their calendar is active', async () => {
    const { client, rows, freezes } = fixture(); freezes.length = 0;
    Object.assign(rows[0], { status: 'active', is_linked_to_sessions: true, sessions_count: 4, sessions_used: 4 });
    await expect(assertCanFreeze(client, 1, 3, () => {})).rejects.toThrow('غير نشط');
  });
});
