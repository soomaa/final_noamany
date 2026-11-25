import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { roundMoney, toNum } from './club-subscription.utils';

export type GroupDiscount = {
  id: number;
  name: string;
  discountType: string;
  discountAmount: number;
  appliedValue: number;
  version?: string;
};

export function calculateGroupDiscount(
  gross: number,
  type: string,
  amount: number,
) {
  return roundMoney(
    Math.min(
      Math.max(0, gross),
      Math.max(
        0,
        type === 'percentage'
          ? (gross * amount) / 100
          : type === 'fixed'
            ? amount
            : 0,
      ),
    ),
  );
}

type GroupRow = { id: number; name: string; discount_type: string; discount_amount: unknown };
type GroupPlanRow = { subscription_type_id: number; discount_type: string; discount_value: unknown };

/**
 * Fingerprint the cashier saw. With per-package rows the fingerprint covers the matched package
 * rule; without them it is the group-wide rule (unchanged for groups set up before packages).
 */
export function groupDiscountVersion(group: GroupRow, plan?: GroupPlanRow | null) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        plan
          ? [group.id, group.name, 'plan', plan.subscription_type_id, plan.discount_type, toNum(plan.discount_value)]
          : [group.id, group.name, group.discount_type, toNum(group.discount_amount)],
      ),
    )
    .digest('hex');
}

/**
 * The discount rule a group gives on one package: the package's own row when the group customises
 * it, otherwise the group's default rule (none = only the customised packages are discounted).
 */
export function groupRuleForPlan(
  group: GroupRow & { plans?: GroupPlanRow[] },
  planIds: number[],
): { discountType: string; discountAmount: number; version: string } | null {
  const plan = (group.plans ?? []).find((row) => planIds.includes(row.subscription_type_id));
  if (plan) {
    if (toNum(plan.discount_value) <= 0) return null;
    return { discountType: plan.discount_type, discountAmount: toNum(plan.discount_value), version: groupDiscountVersion(group, plan) };
  }
  if (group.discount_type === 'none' || toNum(group.discount_amount) <= 0) return null;
  return { discountType: group.discount_type, discountAmount: toNum(group.discount_amount), version: groupDiscountVersion(group) };
}

export async function loadGroupDiscount(
  client: PrismaService | Prisma.TransactionClient,
  memberId: number | null | undefined,
  gross: number,
  subscriptionTypeId?: number | null,
): Promise<GroupDiscount | null> {
  if (!memberId) return null;
  const link = await client.club_member_group_members.findUnique({
    where: { member_id: memberId },
    include: { group: { include: { plans: true } } },
  });
  const group = link?.group;
  if (!group?.is_active) return null;
  // Noamany packages have no branch copies, so the sold package id is the only one to match.
  const planIds: number[] = subscriptionTypeId ? [subscriptionTypeId] : [];
  const rule = groupRuleForPlan(group, planIds);
  if (!rule) return null;
  return {
    id: group.id,
    name: group.name,
    discountType: rule.discountType,
    discountAmount: rule.discountAmount,
    appliedValue: calculateGroupDiscount(gross, rule.discountType, rule.discountAmount),
    version: rule.version,
  };
}

export function groupDiscountColumns(
  group?: GroupDiscount | null,
  appliedValue = group?.appliedValue ?? 0,
) {
  return {
    discount_group_id: group?.id ?? null,
    discount_group_name: group?.name ?? null,
    group_discount_type: group?.discountType ?? null,
    group_discount_rate: group?.discountAmount ?? null,
    group_discount_value: group ? appliedValue : 0,
  };
}

export function mapGroupDiscount(
  row: Record<string, unknown>,
): GroupDiscount | null {
  return row.discount_group_id
    ? {
        id: Number(row.discount_group_id),
        name: String(row.discount_group_name ?? ''),
        discountType: String(row.group_discount_type),
        discountAmount: toNum(row.group_discount_rate),
        appliedValue: toNum(row.group_discount_value),
      }
    : null;
}
