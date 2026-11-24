import { SuspendStatus } from '../../common/utils/suspend-status.util';

/**
 * When a leave (hr_all_agzat_orders) or permission (hr_all_ozonat_orders) counts in payroll and
 * in the daily exceptions list: only at FINAL approval, never at the direct manager's first step
 * (suspend 1 = APPROVED_L1, which HR has not seen yet).
 *
 * Final = suspend 4 (SuspendStatus.APPROVED): the value every later stage of the approval chain
 * writes (leaves/approval-chain.util.ts ACCEPT_SUSPEND). If the chain is reordered so that 4 is
 * written before the last stage, tighten this single helper (e.g. also require close_talab = 'yes').
 */
export const FINAL_APPROVAL_SUSPEND: readonly number[] = [SuspendStatus.APPROVED];

/** Prisma `suspend` filter for finally-approved requests. */
export function finalApprovalSuspendFilter(): { in: number[] } {
  return { in: [...FINAL_APPROVAL_SUSPEND] };
}

export function isFinallyApproved(suspend: number | null | undefined): boolean {
  return suspend != null && FINAL_APPROVAL_SUSPEND.includes(suspend);
}

/** Approved by the direct manager but still waiting for the rest of the chain. */
export function isPendingFinalApproval(suspend: number | null | undefined): boolean {
  return suspend === SuspendStatus.APPROVED_L1;
}
