export type InvitationLeadTone = 'default' | 'success' | 'warning' | 'destructive';

export interface InvitationLeadPresentation {
  label: string;
  tone: InvitationLeadTone;
}

export interface InvitationBalanceSummary {
  subscriptions: Array<{
    subscriptionId: number;
    remaining: number;
  }>;
}

/**
 * Returns the balance that belongs to one subscription only. A missing row stays unknown
 * instead of falling back to the member's aggregate balance, which could belong to another
 * package and incorrectly enable its invitation button.
 */
export function invitationBalanceForSubscription(
  summary: InvitationBalanceSummary | null | undefined,
  subscriptionId: number,
): number | null {
  const row = summary?.subscriptions.find((item) => item.subscriptionId === subscriptionId);
  return row ? Math.max(0, Number(row.remaining) || 0) : null;
}

/**
 * How an invited guest's sales follow-up reads on the invitations screen. A null status
 * means no lead was captured — an email-only or branchless invitation — which reception
 * should notice rather than mistake for an untouched lead.
 */
export function invitationLeadPresentation(status: string | null): InvitationLeadPresentation {
  if (status == null) return { label: 'لم تُنشأ متابعة', tone: 'warning' };
  switch (status) {
    case 'new':
      return { label: 'عميل جديد', tone: 'default' };
    case 'in_progress':
      return { label: 'قيد المتابعة', tone: 'warning' };
    case 'follow_later':
      return { label: 'متابعة لاحقًا', tone: 'warning' };
    case 'qualified':
      return { label: 'مهتم', tone: 'default' };
    case 'converted':
      return { label: 'تم الاشتراك', tone: 'success' };
    case 'lost':
      return { label: 'غير مهتم', tone: 'destructive' };
    default:
      return { label: 'حالة غير معروفة', tone: 'default' };
  }
}
