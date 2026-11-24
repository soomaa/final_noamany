/**
 * Handing a potential member from one sales rep to another.
 *
 * The transfer used to be a bare write to `assigned_to`: nothing recorded that it had
 * happened, so the receiving rep was never told and the list had nothing to order by. The
 * rules below are kept pure and separate from the service because they decide who gets
 * notified — getting "is this a handover?" wrong either spams a rep on every unrelated
 * edit or silently loses the one notification that mattered.
 */

/** A stored or submitted assignee, normalised. Blank and 0 both mean "nobody". */
export function normalizeAssignee(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * True when an edit actually moves the lead to a different rep.
 *
 * `undefined` means the form did not carry the field at all, which is not a handover —
 * only an explicit, different value is. Unassigning (to `null`) counts: the lead left the
 * rep who had it, and the trail should say when.
 */
export function isHandover(current: unknown, next: unknown): boolean {
  if (next === undefined) return false;
  return normalizeAssignee(current) !== normalizeAssignee(next);
}

/** The columns a handover writes. `assignment_seen_at` resets so the badge comes back. */
export function handoverStamp(actorUserId: number | null | undefined, at: Date = new Date()) {
  return {
    assigned_at: at,
    assigned_by: Number.isInteger(actorUserId) && (actorUserId as number) > 0 ? (actorUserId as number) : null,
    assignment_seen_at: null,
  };
}

/**
 * Whether the receiving rep still has this lead flagged as newly handed to them.
 *
 * Only for the rep who holds it: a manager looking at the same row is not the one being
 * told, and showing them the badge would make every transfer look unread forever.
 */
export function isUnseenHandover(
  row: { assigned_to?: unknown; assigned_at?: unknown; assignment_seen_at?: unknown },
  viewerEmployeeId: number | null,
): boolean {
  if (viewerEmployeeId == null) return false;
  if (normalizeAssignee(row.assigned_to) !== viewerEmployeeId) return false;
  if (!row.assigned_at) return false;
  return !row.assignment_seen_at;
}

/**
 * List order for the potential-members screen.
 *
 * A rep opens this page to find what just landed on their desk, so the most recent
 * handover comes first. MySQL sorts NULLs last on a descending key, which puts the leads
 * that were never transferred below the ones that were — exactly the wanted grouping,
 * with `id` breaking ties so the order is stable between pages.
 *
 * A supervisor sees the whole club's pipeline, where ordering by handover would bury the
 * newest leads under old transfers, so their view keeps the newest-first order it had.
 */
export function leadListOrder(restrictedToOneRep: boolean): Record<string, 'asc' | 'desc'>[] {
  return restrictedToOneRep
    ? [{ assigned_at: 'desc' }, { id: 'desc' }]
    : [{ id: 'desc' }];
}
