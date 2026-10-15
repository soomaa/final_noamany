import { leadSubscriptionContexts } from './lead-subscription-context';

describe('lead subscription context', () => {
  it('returns actual paid amount and the latest contract in the lead branch', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 3,
        branch_id: 1,
        member_id: 7,
        member: { phone: '01000000001' },
        guardian_phone: null,
        subscription_number: 'ONE-3',
        subscription_type: 'سنوي',
        paid_amount: 3800,
        subscription_start_date: '2026-01-01',
        subscription_end_date: '2026-12-31',
      },
      {
        id: 4,
        branch_id: 2,
        member_id: 8,
        member: { phone: '01000000001' },
        guardian_phone: null,
        subscription_number: 'OTHER',
        subscription_type: 'فرع آخر',
        paid_amount: 9999,
        subscription_start_date: '2027-01-01',
        subscription_end_date: '2027-12-31',
      },
    ]);

    const result = await leadSubscriptionContexts(
      { club_subscriptions: { findMany } } as never,
      [{ id: 1, branch_id: 1, phone: '+201000000001', converted_member_id: null }],
    );

    expect(result.get(1)).toEqual({
      subscriptionNumber: 'ONE-3',
      packageName: 'سنوي',
      paidAmount: 3800,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(findMany.mock.calls[0][0].where.OR[0].branch_id).toBe(1);
  });

  it('does not guess financial details when a phone belongs to multiple members', async () => {
    const rows = [7, 8].map((member_id) => ({
      id: member_id,
      branch_id: 1,
      member_id,
      member: { phone: '01000000001' },
      guardian_phone: null,
      subscription_number: `ONE-${member_id}`,
      subscription_type: 'شهري',
      paid_amount: 800,
      subscription_start_date: '2026-01-01',
      subscription_end_date: '2026-01-31',
    }));

    const result = await leadSubscriptionContexts(
      { club_subscriptions: { findMany: async () => rows } } as never,
      [{ id: 1, branch_id: 1, phone: '01000000001', converted_member_id: null }],
    );

    expect(result.has(1)).toBe(false);
  });
});
