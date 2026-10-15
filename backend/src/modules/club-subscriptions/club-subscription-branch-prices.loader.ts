import type { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from './club-subscription.utils';

export type SubscriptionTypeBranchPrice = { branchId: number; price: number };

/** True when the branch-prices table has not been migrated yet on this database. */
export function isMissingBranchPricesTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('club_subscription_type_branch_prices');
}

/**
 * Load per-branch package overrides when the table exists.
 * Returns an empty map if the migration has not been applied yet so sales keep working.
 */
export async function loadSubscriptionTypeBranchPrices(
  prisma: PrismaService,
  subscriptionTypeIds: number[],
): Promise<Map<number, SubscriptionTypeBranchPrice[]>> {
  const map = new Map<number, SubscriptionTypeBranchPrice[]>();
  const ids = [...new Set(subscriptionTypeIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return map;

  const branchPrices = (
    prisma as unknown as {
      club_subscription_type_branch_prices?: {
        findMany: (args: unknown) => Promise<
          Array<{ subscription_type_id: number; branch_id: number; price: unknown }>
        >;
      };
    }
  ).club_subscription_type_branch_prices;
  // dist updated before `prisma generate` — delegate missing until client is regenerated.
  if (!branchPrices?.findMany) return map;

  try {
    const rows = await branchPrices.findMany({
      where: { subscription_type_id: { in: ids } },
      select: { subscription_type_id: true, branch_id: true, price: true },
    });
    for (const row of rows) {
      const list = map.get(row.subscription_type_id) ?? [];
      list.push({ branchId: row.branch_id, price: toNum(row.price) });
      map.set(row.subscription_type_id, list);
    }
  } catch (error) {
    if (!isMissingBranchPricesTableError(error)) throw error;
  }
  return map;
}

export async function loadBranchPricesForType(
  prisma: PrismaService,
  subscriptionTypeId: number,
): Promise<SubscriptionTypeBranchPrice[]> {
  const map = await loadSubscriptionTypeBranchPrices(prisma, [subscriptionTypeId]);
  return map.get(subscriptionTypeId) ?? [];
}

