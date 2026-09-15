import { Prisma } from '@prisma/client';

/** Minimal shape shared by subscription creation and plan-transfer validation. */
export type BranchAssignedSubscriptionType = {
  branch_id: number | null;
  apply_to_all_branches: boolean;
  branches?: Array<{ branch_id: number }>;
};

/**
 * A plan is sellable at a branch only when it is explicitly global or explicitly assigned
 * to that branch. A null legacy branch is deliberately not treated as global: that was the
 * source of identically named, differently priced plans leaking between branches.
 */
export function isSubscriptionTypeAvailableAtBranch(
  type: BranchAssignedSubscriptionType,
  branchId: number,
): boolean {
  return (
    type.apply_to_all_branches ||
    type.branch_id === branchId ||
    Boolean(type.branches?.some((branch) => branch.branch_id === branchId))
  );
}

/** Prisma filter for the plans visible in a concrete set of branches. `null` means admin/all. */
export function subscriptionTypeBranchWhere(
  branchIds: number[] | null,
): Prisma.club_subscription_typesWhereInput {
  if (branchIds === null) return {};
  if (branchIds.length === 0) return { id: -1 };
  return {
    OR: [
      { apply_to_all_branches: true },
      { branch_id: { in: branchIds } },
      { branches: { some: { branch_id: { in: branchIds } } } },
    ],
  };
}

