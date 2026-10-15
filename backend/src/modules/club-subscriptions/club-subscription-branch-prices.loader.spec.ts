import { loadSubscriptionTypeBranchPrices, isMissingBranchPricesTableError } from './club-subscription-branch-prices.loader';

describe('club-subscription-branch-prices.loader', () => {
  it('detects missing branch-prices table errors', () => {
    expect(
      isMissingBranchPricesTableError(
        new Error("Table `club_subscription_type_branch_prices` doesn't exist"),
      ),
    ).toBe(true);
    expect(isMissingBranchPricesTableError(new Error('other'))).toBe(false);
  });

  it('returns empty map when prisma delegate is missing (client not regenerated)', async () => {
    const map = await loadSubscriptionTypeBranchPrices({} as never, [1]);
    expect(map.size).toBe(0);
  });

  it('returns empty map when branch-prices table is missing', async () => {
    const prisma = {
      club_subscription_type_branch_prices: {
        findMany: jest.fn().mockRejectedValue(
          new Error("Table `club_subscription_type_branch_prices` doesn't exist"),
        ),
      },
    };
    const map = await loadSubscriptionTypeBranchPrices(prisma as never, [1, 2]);
    expect(map.size).toBe(0);
  });

  it('loads branch prices when table exists', async () => {
    const prisma = {
      club_subscription_type_branch_prices: {
        findMany: jest.fn().mockResolvedValue([
          { subscription_type_id: 1, branch_id: 2, price: 450 },
        ]),
      },
    };
    const map = await loadSubscriptionTypeBranchPrices(prisma as never, [1]);
    expect(map.get(1)).toEqual([{ branchId: 2, price: 450 }]);
  });
});
