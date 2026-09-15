/**
 * Employee records use the current UI convention (1 = men, 2 = women), while
 * legacy session/JWT consumers use 0 = men, 1 = women, 2 = unrestricted.
 * Unknown or unlinked staff get an invalid sentinel so non-admin access fails
 * closed; system administrators remain unrestricted by their level claim.
 */
export function legacyAudienceScopeFromEmployeeType(
  employeeType: number | null | undefined,
): 0 | 1 | -1 {
  if (employeeType === 1) return 0;
  if (employeeType === 2) return 1;
  return -1;
}
