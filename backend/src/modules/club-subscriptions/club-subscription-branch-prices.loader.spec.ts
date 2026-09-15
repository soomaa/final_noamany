import { loadSubscriptionTypeBranchPrices } from './club-subscription-branch-prices.loader';

describe('branch subscription prices', () => {
  it('keeps an explicit branch override separate from the package base price', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { subscription_type_id: 7, branch_id: 2, price: 600 },
      { subscription_type_id: 7, branch_id: 3, price: 650 },
    ]);
    const result = await loadSubscriptionTypeBranchPrices({
      club_subscription_type_branch_prices: { findMany },
    } as never, [7]);
    expect(result.get(7)).toEqual([{ branchId: 2, price: 600 }, { branchId: 3, price: 650 }]);
  });

  it('does not take subscription sales offline before the additive table is deployed', async () => {
    const result = await loadSubscriptionTypeBranchPrices({
      club_subscription_type_branch_prices: { findMany: jest.fn().mockRejectedValue(new Error("Table 'club_subscription_type_branch_prices' doesn't exist")) },
    } as never, [7]);
    expect(result.size).toBe(0);
  });
});
