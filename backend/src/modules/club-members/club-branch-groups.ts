/** Expand only the legacy Tanta main branch used by club reports and listings. */
export function expandClubReportBranchIds(branchIds: number[] | null): number[] | null {
  return branchIds?.length === 1 && branchIds[0] === 2 ? [2, 5, 6] : branchIds;
}
