import { phoneNational } from './phone-display';

/** Digits left readable at the end of a locally masked number — same as the server. */
const PHONE_TAIL = 2;

export type RevealIds = { memberId?: number | null; leadId?: number | null };

/** The audited single-record endpoint for this member or potential member, if any. */
export function revealPhonePath({ memberId, leadId }: RevealIds): string | null {
  if (memberId != null) return `/club-members/${memberId}/phone`;
  if (leadId != null) return `/club-members/potential-leads/${leadId}/phone`;
  return null;
}

/**
 * `201554441578` → `*********78`: what a list shows even to someone holding the grant.
 *
 * Masks the national form the screen would otherwise print, so the stars line up with
 * what the server sends to a caller without the grant and the two are indistinguishable.
 */
export function maskPhoneLocally(phone: string): string {
  const national = phoneNational(phone);
  if (national.length <= PHONE_TAIL) return '*'.repeat(national.length);
  return '*'.repeat(national.length - PHONE_TAIL) + national.slice(-PHONE_TAIL);
}
