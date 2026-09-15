import { receiptBusinessBranchWhere, receiptMemberAudienceWhere } from './receipt-business-scope';

describe('receiptBusinessBranchWhere', () => {
  it('uses one authoritative branch with subscription, locker, member, then header precedence', () => {
    expect(receiptBusinessBranchWhere([2, 5])).toEqual({
      OR: [
        {
          subscription_id: { not: null },
          subscription: { is: { branch_id: { in: [2, 5] } } },
        },
        {
          subscription_id: null,
          locker_subscription_id: { not: null },
          locker_subscription: { is: { main_branch_id: { in: [2, 5] } } },
        },
        {
          subscription_id: null,
          locker_subscription_id: null,
          member_id: { not: null },
          member: { is: { branch_id: { in: [2, 5] } } },
        },
        {
          subscription_id: null,
          locker_subscription_id: null,
          member_id: null,
          branch_id: { in: [2, 5] },
        },
      ],
    });
  });

  it('returns no branch restriction for system-wide access and fails closed for no branches', () => {
    expect(receiptBusinessBranchWhere(null)).toEqual({});
    expect(receiptBusinessBranchWhere([])).toEqual({ id: -1 });
  });

  it('fails anonymous receipts closed and follows canonical member fallbacks for an audience', () => {
    const where = receiptMemberAudienceWhere('female');
    expect(where.OR).toHaveLength(3);
    expect(where.OR?.[0]).toEqual(expect.objectContaining({
      subscription_id: { not: null },
    }));
    expect(where.OR?.[1]).toEqual(expect.objectContaining({
      subscription_id: null,
      locker_subscription_id: { not: null },
    }));
    expect(receiptMemberAudienceWhere(null)).toEqual({});
  });
});
