import type { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from './club-subscription.utils';

export type SubscriptionTypeBranchPrice = { branchId: number; price: number };

export function isMissingBranchPricesTableError(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error ?? '').includes('club_subscription_type_branch_prices');
}

/**
 * Missing table is deliberately a safe fallback during a rolling migration. Package base price
 * remains authoritative until the generated Prisma client and database are both upgraded.
 */
export async function loadSubscriptionTypeBranchPrices(prisma: PrismaService, subscriptionTypeIds: number[]) {
  const ids = [...new Set(subscriptionTypeIds.filter((id) => Number.isInteger(id) && id > 0))];
  const results = new Map<number, SubscriptionTypeBranchPrice[]>();
  if (!ids.length) return results;
  const delegate = (prisma as unknown as { club_subscription_type_branch_prices?: { findMany(args: unknown): Promise<Array<{ subscription_type_id: number; branch_id: number; price: unknown }>> } }).club_subscription_type_branch_prices;
  if (!delegate) return results;
  try {
    const rows = await delegate.findMany({ where: { subscription_type_id: { in: ids } }, select: { subscription_type_id: true, branch_id: true, price: true } });
    for (const row of rows) {
      const prices = results.get(row.subscription_type_id) ?? [];
      prices.push({ branchId: row.branch_id, price: toNum(row.price) });
      results.set(row.subscription_type_id, prices);
    }
  } catch (error) {
    if (!isMissingBranchPricesTableError(error)) throw error;
  }
  return results;
}

export async function loadBranchPricesForType(prisma: PrismaService, subscriptionTypeId: number) {
  return (await loadSubscriptionTypeBranchPrices(prisma, [subscriptionTypeId])).get(subscriptionTypeId) ?? [];
}
