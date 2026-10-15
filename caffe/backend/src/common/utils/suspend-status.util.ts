export type SuspendUiStatus = 'pending' | 'incoming' | 'approved' | 'rejected' | 'investigating' | 'paid';

/**
 * Named values for the `suspend` workflow column shared by HR request tables
 * (leaves, missions, loans, rewards, penalties, permissions, requests).
 *
 * Verified from the write paths:
 *   - reject()  writes 2  (loans/penalties)
 *   - cancel()  writes 5  (leaves, alongside reason_action='cancel')
 *   - approve   walks 0 → 1 → 4 (nextApproveSuspend)
 *
 *   approved filter = { APPROVED_L1, APPROVED }  (1, 4)
 *   "rejected" filter = { REJECTED, CANCELLED }  (2, 5) — the legacy UI renders
 *      cancelled rows under the same "rejected" badge.
 *
 * The numeric values are the actual values stored in the database and must not
 * change without a data migration — this enum only makes call sites readable.
 */
export const SuspendStatus = {
  INCOMING: 0, // newly submitted, not yet acted on
  APPROVED_L1: 1, // first-level approved, still pending final approval
  REJECTED: 2, // rejected on review
  INVESTIGATING: 3,
  APPROVED: 4, // fully approved
  CANCELLED: 5, // cancelled after approval (shown as "rejected" in the legacy UI)
} as const;

/** @deprecated use SuspendStatus.INVESTIGATING */
export const SUSPEND_INVESTIGATING = SuspendStatus.INVESTIGATING;

/** suspend 0=pending/incoming, 1|4=approved path, 2|5=rejected */
/** suspend values that count as "approved" in list filters (1, 4). */
export const SUSPEND_APPROVED: number[] = [SuspendStatus.APPROVED_L1, SuspendStatus.APPROVED];
/** suspend values shown under the "rejected" filter — rejected + cancelled (2, 5). */
export const SUSPEND_REJECTED: number[] = [SuspendStatus.REJECTED, SuspendStatus.CANCELLED];

export function suspendToUiStatus(suspend: number | null | undefined): SuspendUiStatus {
  const s = suspend ?? SuspendStatus.INCOMING;
  if (s === SuspendStatus.INVESTIGATING) return 'investigating';
  if (s === SuspendStatus.INCOMING) return 'incoming';
  if (SUSPEND_APPROVED.includes(s)) return 'approved';
  if (SUSPEND_REJECTED.includes(s)) return 'rejected';
  return 'pending';
}

/** Frontend list row status (badges + approve actions). */
export function suspendToListStatus(suspend: number | null | undefined, paid?: boolean): string {
  if (paid) return 'paid';
  const s = suspend ?? SuspendStatus.INCOMING;
  if (s === SuspendStatus.APPROVED) return 'approved';
  if (SUSPEND_REJECTED.includes(s)) return 'rejected';
  if (s === SuspendStatus.INVESTIGATING) return 'investigating';
  return 'pending';
}

export function hrRequestStatusToLabel(status: number): string {
  if (SUSPEND_APPROVED.includes(status)) return 'approved';
  if (SUSPEND_REJECTED.includes(status)) return 'rejected';
  if (status === SuspendStatus.INVESTIGATING) return 'investigating';
  return 'pending';
}

export function canApprove(suspend: number | null | undefined): boolean {
  const s = suspend ?? SuspendStatus.INCOMING;
  return s === SuspendStatus.INCOMING || s === SuspendStatus.APPROVED_L1;
}

export function nextApproveSuspend(current: number): number {
  if (current === SuspendStatus.INCOMING) return SuspendStatus.APPROVED_L1;
  if (current === SuspendStatus.APPROVED_L1) return SuspendStatus.APPROVED;
  return current;
}

export function rejectSuspend(): number {
  return SuspendStatus.REJECTED;
}

export function buildSuspendWhere(status?: string): { suspend?: number | { in: number[] } } | undefined {
  if (!status) return undefined;
  switch (status) {
    case 'incoming':
      return { suspend: SuspendStatus.INCOMING };
    case 'pending':
      return { suspend: { in: [SuspendStatus.INCOMING, SuspendStatus.APPROVED_L1] } };
    case 'approved':
      return { suspend: { in: SUSPEND_APPROVED } };
    case 'rejected':
      return { suspend: { in: SUSPEND_REJECTED } };
    case 'investigating':
      return { suspend: SuspendStatus.INVESTIGATING };
    default:
      return undefined;
  }
}
