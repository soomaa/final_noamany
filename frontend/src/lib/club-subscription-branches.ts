import type { ClubSubscriptionType } from '@/types/club';

/** Keep branch availability rules identical everywhere plans are sold or transferred. */
export function subscriptionTypeAvailableAtBranch(
  type: Pick<ClubSubscriptionType, 'applyToAllBranches' | 'branchId' | 'branchIds'>,
  branchId: number | null | undefined,
): boolean {
  if (!branchId) return false;
  return Boolean(
    type.applyToAllBranches ||
    type.branchId === branchId ||
    type.branchIds?.includes(branchId),
  );
}

export function subscriptionTypesForBranch<T extends ClubSubscriptionType>(
  types: T[],
  branchId: number | null | undefined,
): T[] {
  return branchId
    ? types.filter((type) => subscriptionTypeAvailableAtBranch(type, branchId))
    : [];
}
