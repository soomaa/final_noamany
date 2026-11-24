/**
 * What the desk says happened after contacting a potential member.
 *
 * The sales team asked for six plain words — "no answer", "arrange visit", "membership
 * done" — rather than the pipeline vocabulary the system was built on. These are NOT a
 * second field alongside `status`: a lead whose feedback says "not interested" while its
 * status says "contacted" is a contradiction nothing could resolve, and every list, filter
 * and report would have to pick a side. Each option therefore *is* a status, written in
 * the words the desk actually uses.
 *
 * Two of them take the lead out of the working queue. `lost` and `membership_done` are
 * answered — one closed, one waiting on reception to take the payment — and leaving them
 * in front of the reps buries the leads still worth calling. Both stay one filter away.
 *
 * `membership_done` deliberately does NOT convert the lead. Converting creates a member, a
 * subscription and a receipt, which is reception's job and needs the money collected
 * first; a rep marking their own sale as complete would create members nobody paid for.
 * It is a flag that says "ready for reception", and the real conversion clears it.
 */
export interface LeadFeedbackOption {
  /** What the button says, and what the API accepts. */
  key: string;
  /** The `club_leads.status` it writes. */
  status: string;
  /** A visit or a call-back has to be scheduled, or the option means nothing. */
  requiresDate: boolean;
  /** Out of the rep's queue; reachable through its own filter. */
  closesLead: boolean;
  labelAr: string;
  labelEn: string;
}

export const LEAD_FEEDBACK_OPTIONS: readonly LeadFeedbackOption[] = [
  { key: 'no_answer',     status: 'no_answer',     requiresDate: true,  closesLead: false, labelAr: 'لم يرد',            labelEn: 'No answer' },
  { key: 'unreachable',   status: 'unreachable',   requiresDate: false, closesLead: false, labelAr: 'تعذّر الوصول',       labelEn: 'Unreachable' },
  { key: 'follow_up',     status: 'follow_up',     requiresDate: true,  closesLead: false, labelAr: 'متابعة',            labelEn: 'Follow up' },
  { key: 'arrange_visit', status: 'visit_arranged', requiresDate: true, closesLead: false, labelAr: 'تحديد زيارة',       labelEn: 'Arrange visit' },
  { key: 'not_interested', status: 'lost',         requiresDate: false, closesLead: true,  labelAr: 'غير مهتم',          labelEn: 'Not interested' },
  { key: 'membership_done', status: 'membership_done', requiresDate: false, closesLead: true, labelAr: 'تم الاشتراك',   labelEn: 'Membership done' },
] as const;

export function feedbackOption(key: string | null | undefined): LeadFeedbackOption | null {
  const k = String(key ?? '').trim();
  return LEAD_FEEDBACK_OPTIONS.find((o) => o.key === k) ?? null;
}

/** Every status a feedback option can produce — what the status filter may offer. */
export const FEEDBACK_STATUSES = LEAD_FEEDBACK_OPTIONS.map((o) => o.status);
