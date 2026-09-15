import { Prisma } from '@prisma/client';

/**
 * Resolve a receipt to one business branch only. A linked subscription owns the branch;
 * locker, member, and finally the receipt header are fallbacks for older standalone rows.
 */
export function receiptBusinessBranchWhere(
  branchIds: number[] | null,
): Prisma.club_receiptsWhereInput {
  if (branchIds === null) return {};
  if (branchIds.length === 0) return { id: -1 };

  return {
    OR: [
      {
        subscription_id: { not: null },
        subscription: { is: { branch_id: { in: branchIds } } },
      },
      {
        subscription_id: null,
        locker_subscription_id: { not: null },
        locker_subscription: { is: { main_branch_id: { in: branchIds } } },
      },
      {
        subscription_id: null,
        locker_subscription_id: null,
        member_id: { not: null },
        member: { is: { branch_id: { in: branchIds } } },
      },
      {
        subscription_id: null,
        locker_subscription_id: null,
        member_id: null,
        branch_id: { in: branchIds },
      },
    ],
  };
}

/** Canonical member audience follows the same business-source precedence as branch ownership. */
export function receiptMemberAudienceWhere(
  audience: 'male' | 'female' | null,
): Prisma.club_receiptsWhereInput {
  if (!audience) return {};
  const member = { is: { is_deleted: false, gender: audience } };
  return {
    OR: [
      {
        subscription_id: { not: null },
        subscription: { is: { member } },
      },
      {
        subscription_id: null,
        locker_subscription_id: { not: null },
        locker_subscription: { is: { member } },
      },
      {
        subscription_id: null,
        locker_subscription_id: null,
        member_id: { not: null },
        member,
      },
    ],
  };
}
