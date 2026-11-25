import type { ClubSubscriptionListItem } from '@/types/club';

/** Ported from Meta Fit's reception WhatsApp button (subscription summary tabs). */
export type MemberMessageSubscription = Pick<
  ClubSubscriptionListItem,
  | 'id' | 'memberId' | 'subscriptionNumber' | 'subscriptionType' | 'subscriptionStartDate' | 'subscriptionEndDate'
  | 'status' | 'subscriptionValue' | 'discountEnabled' | 'discountValue' | 'paidAmount' | 'remainingAmount'
  | 'transferredCreditAmount' | 'waivedAmount' | 'receiptNumber' | 'isLinkedToSessions' | 'sessionsCount'
  | 'sessionsUsed' | 'privatePackageId' | 'allowMultipleDailyEntries' | 'isTimeBased' | 'timeFrom' | 'timeTo'
  | 'activeFreeze' | 'assignedStaffName' | 'registrationDate' | 'subscriptionTypeName' | 'customerName'
>;

const toLatinDigits = (text: string) =>
  text.replace(/[٠-٩۰-۹]/g, (digit) =>
    String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

/** Egyptian mobiles (010/011/012/015) become 20XXXXXXXXXX; anything else must already be international. */
export function whatsappPhone(phone: string | null | undefined): string | null {
  let digits = toLatinDigits(phone ?? '').replace(/[\s()+.-]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (/^01[0125]\d{8}$/.test(digits)) digits = `20${digits.slice(1)}`;
  else if (/^1[0125]\d{8}$/.test(digits)) digits = `20${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/**
 * A chat with the message typed in. Uses api.whatsapp.com/send, not wa.me: wa.me's redirect page
 * turns emoji into «�» (client screenshot, 25 Nov), the send endpoint keeps them.
 */
export function whatsappMessageLink(phone: string, message: string): string {
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
}

export function searchMemberSubscriptions(rows: readonly MemberMessageSubscription[], search: string): MemberMessageSubscription[] {
  const normalize = (text: string) => toLatinDigits(text.normalize('NFKC').toLocaleLowerCase());
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const text = normalize(`${row.subscriptionType ?? ''} ${row.subscriptionNumber} ${row.subscriptionStartDate} ${row.subscriptionEndDate}`);
    return terms.every((term) => text.includes(term));
  });
}

// The message itself is built by memberSubscriptionsMessage in '@/lib/whatsapp-message' (templates).

/** Load every page; a partial list must never be presented as all subscriptions. */
export async function loadMemberSubscriptions(
  memberId: number,
  loadPage: (page: number) => Promise<{ data: MemberMessageSubscription[]; total: number }>,
): Promise<MemberMessageSubscription[]> {
  const rows = new Map<number, MemberMessageSubscription>();
  for (let page = 1; page <= 100; page++) {
    const response = await loadPage(page);
    if (!Array.isArray(response.data) || !Number.isInteger(response.total) || response.total < 0) {
      throw new Error('Invalid subscription response');
    }
    const previous = rows.size;
    for (const row of response.data) {
      if (row.memberId !== memberId) throw new Error('Subscription member mismatch');
      rows.set(row.id, row);
    }
    if (rows.size >= response.total) return [...rows.values()];
    if (rows.size === previous) throw new Error('Incomplete subscription response');
  }
  throw new Error('Unable to load all subscription pages');
}
