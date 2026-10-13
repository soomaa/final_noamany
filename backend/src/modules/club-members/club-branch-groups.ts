const TANTA_MEMBER_BRANCH_IDS = [2, 5, 6] as const;
const TANTA_MAIN_BRANCH_ID = 2;

/** Expand only the legacy Tanta main branch used by club reports and listings. */
export function expandClubReportBranchIds(branchIds: number[] | null): number[] | null {
  return branchIds?.length === 1 && branchIds[0] === TANTA_MAIN_BRANCH_ID
    ? [...TANTA_MEMBER_BRANCH_IDS]
    : branchIds;
}

/** Store new Tanta-area members under Tanta main, regardless of their entry point. */
export function canonicalClubMemberBranchId(branchId: number): number {
  return TANTA_MEMBER_BRANCH_IDS.includes(branchId as (typeof TANTA_MEMBER_BRANCH_IDS)[number])
    ? TANTA_MAIN_BRANCH_ID
    : branchId;
}

/** Branches that share the built-in Tanta member identity. */
export function clubMemberIdentityBranchIds(branchId: number): number[] {
  return canonicalClubMemberBranchId(branchId) === TANTA_MAIN_BRANCH_ID
    ? [...TANTA_MEMBER_BRANCH_IDS]
    : [branchId];
}

/** A Tanta member may subscribe at Tanta main, Up, or Down. Other branches stay isolated. */
export function shareClubMemberIdentity(memberBranchId: number, subscriptionBranchId: number): boolean {
  return canonicalClubMemberBranchId(memberBranchId) === canonicalClubMemberBranchId(subscriptionBranchId);
}
