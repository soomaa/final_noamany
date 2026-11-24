/**
 * The outcomes a rep can report after contacting a potential member.
 *
 * One list, used by both screens that ask the question — the potential-members table and
 * the sales workspace's lead file. They drifted before: the table offered six outcomes
 * while the workspace offered two, so the same lead got a different vocabulary depending
 * on which screen the rep happened to be on.
 *
 * `status` must match `lead-feedback.ts` on the server, which owns the mapping and rejects
 * anything it does not recognise — a drift here fails loudly instead of writing a wrong
 * status.
 */
export interface LeadFeedbackOption {
  key: string;
  /** The pipeline status the server writes for this outcome. */
  status: string;
  ar: string;
  en: string;
  /** A call-back or visit has to be scheduled, or the outcome means nothing. */
  requiresDate: boolean;
  /** Takes the lead out of the working queue; still reachable by its own filter. */
  closes: boolean;
  /** Only sensible after a call nobody picked up. */
  unansweredOnly?: boolean;
}

export const LEAD_FEEDBACK_OPTIONS: readonly LeadFeedbackOption[] = [
  { key: 'no_answer', status: 'no_answer', ar: 'لم يرد', en: 'No answer', requiresDate: true, closes: false, unansweredOnly: true },
  { key: 'unreachable', status: 'unreachable', ar: 'تعذّر الوصول', en: 'Unreachable', requiresDate: false, closes: false, unansweredOnly: true },
  { key: 'follow_up', status: 'follow_up', ar: 'متابعة', en: 'Follow up', requiresDate: true, closes: false },
  { key: 'arrange_visit', status: 'visit_arranged', ar: 'تحديد زيارة', en: 'Arrange visit', requiresDate: true, closes: false },
  { key: 'not_interested', status: 'lost', ar: 'غير مهتم', en: 'Not interested', requiresDate: false, closes: true },
  { key: 'membership_done', status: 'membership_done', ar: 'تم الاشتراك', en: 'Membership done', requiresDate: false, closes: true },
];

/**
 * The outcomes worth showing, given what the rep has already told the form.
 *
 * A call nobody answered cannot have produced "not interested" or a booked visit — the
 * customer never spoke. Offering those anyway invites a rep to click the nearest button
 * and record something that did not happen.
 */
export function feedbackOptionsFor(opts: { activityType?: string; answered?: boolean }): LeadFeedbackOption[] {
  const unanswered = opts.activityType === 'call' && opts.answered === false;
  return LEAD_FEEDBACK_OPTIONS.filter((o) => (unanswered ? o.unansweredOnly : !o.unansweredOnly));
}

export function feedbackByStatus(status: string | null | undefined): LeadFeedbackOption | null {
  return LEAD_FEEDBACK_OPTIONS.find((o) => o.status === status) ?? null;
}
