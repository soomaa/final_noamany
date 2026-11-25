import type { ClubMemberGroup } from '@/types/club';

export function memberGroupDiscountValue(
  gross: number,
  group?: ClubMemberGroup | null,
): number {
  const value = Math.max(0, Number(gross) || 0);
  const discount =
    group?.discountType === 'percentage'
      ? (value * group.discountAmount) / 100
      : group?.discountType === 'fixed'
        ? group.discountAmount
        : 0;
  return (
    Math.round(
      (Math.min(value, Math.max(0, discount)) + Number.EPSILON) * 100,
    ) / 100
  );
}

export function hasMemberGroupDiscount(group?: ClubMemberGroup | null) {
  return !!group && group.discountType !== 'none' && group.discountAmount > 0;
}

/**
 * The member's group rule for one package (null when the group does not discount it): the
 * package's own rule, else the group default. Branch copies count as their main package. Mirrors the server's groupRuleForPlan.
 */
export function groupForPackage(
  group: ClubMemberGroup | null | undefined,
  subscriptionTypeId: number | null | undefined,
  sourceSubscriptionTypeId?: number | null,
): ClubMemberGroup | null {
  if (!group) return null;
  const ids = [subscriptionTypeId, sourceSubscriptionTypeId].filter((id): id is number => !!id);
  const plan = group.plans?.find((row) => ids.includes(row.subscriptionTypeId));
  // A customised package uses its own rule; every other package gets the group's default rule.
  if (plan) {
    return plan.discountAmount > 0
      ? { ...group, discountType: plan.discountType, discountAmount: plan.discountAmount, version: plan.version }
      : null;
  }
  return hasMemberGroupDiscount(group) ? group : null;
}
