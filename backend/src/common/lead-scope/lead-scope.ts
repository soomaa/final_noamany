/**
 * Which leads a caller may see in the potential-members list.
 *
 * A sales rep works their own pipeline, so the list has to be theirs: seeing every lead in
 * the club makes the page useless for actually working it and lets any rep read — and
 * poach — another's customers. Managers and admins keep the full view, because supervising
 * the pipeline is the job.
 *
 * Note the failure mode this deliberately avoids: an unresolved rep gets an *empty* list,
 * never the whole table. A filter that disappears when identification fails is the same
 * bug as having no filter at all.
 */
export interface LeadScope {
  /** The rep whose leads to show, or null for an unrestricted view. */
  assignedTo: number | null;
  /** True when the caller is a rep — the list must then stay restricted. */
  restricted: boolean;
}

export function leadScopeFor(isSalesRep: boolean, employeeId: number | null | undefined): LeadScope {
  if (!isSalesRep) return { assignedTo: null, restricted: false };
  return { assignedTo: employeeId ?? null, restricted: true };
}

/**
 * The Prisma filter for a scope. A restricted caller with no resolvable employee gets a
 * predicate that matches nothing rather than an absent one.
 */
export function leadScopeWhere(scope: LeadScope): Record<string, unknown> {
  if (!scope.restricted) return {};
  if (scope.assignedTo == null) return { assigned_to: -1 };
  return { assigned_to: scope.assignedTo };
}
