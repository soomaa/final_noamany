const EGYPT_TZ = 'Africa/Cairo';

/**
 * Mobile numbers are stored as digits only.  We deliberately do not tie this
 * to a specific country: the gym registers Egyptian mobile numbers only.
 */
const PHONE_REGEX = /^\d{11}$/;
const PHONE_FORMAT_ERROR = 'رقم الموبايل غير صحيح — يجب أن يكون 11 رقمًا';
const STANDARD_NATIONAL_ID_REGEX = /^\d{14}$/;
const CHILD_NATIONAL_ID_REGEX = /^(\d{14})-C(\d{2})$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Local calendar date YYYY-MM-DD (Egypt), not UTC. */
export function localDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: EGYPT_TZ }).format(date);
}

export function normalizeName(name: string): string {
  return String(name)
    .replace(/[\s\u00A0\u2000-\u200B\uFEFF]+/g, ' ')
    .trim();
}

export function normalizePhoneInput(phone: string): string {
  return String(phone).trim().replace(/[\s\-()+]/g, '');
}

export function isValidPhoneFormat(phone: string): boolean {
  return PHONE_REGEX.test(normalizePhoneInput(phone));
}

export function normalizePhoneForStorage(phone: string): string {
  const n = normalizePhoneInput(phone);
  // Preserve the legacy local form only for a complete Egyptian mobile number.
  // A number that merely starts with 201 can belong to another country/area code.
  if (/^201\d{9}$/.test(n)) return `0${n.slice(2)}`;
  return n;
}

export function getPhoneValidationError(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return 'رقم الموبايل مطلوب';
  const n = normalizePhoneInput(phone);
  if (/^0+$/.test(n)) return PHONE_FORMAT_ERROR;
  if (!isValidPhoneFormat(phone)) {
    return PHONE_FORMAT_ERROR;
  }
  return null;
}

export function normalizeCardNumber(card: string): string {
  return String(card).trim().replace(/\s+/g, '').toUpperCase();
}

export function isValidNationalIdFormat(card: string): boolean {
  const n = normalizeCardNumber(card);
  return STANDARD_NATIONAL_ID_REGEX.test(n) || CHILD_NATIONAL_ID_REGEX.test(n);
}

export function normalizeNationalIdForStorage(card: string): string {
  return normalizeCardNumber(card);
}

export function getNationalIdFormatError(card: string | null | undefined): string | null {
  if (!card?.trim()) return null;
  if (!isValidNationalIdFormat(card)) {
    return 'الرقم القومي غير صحيح — يجب أن يكون 14 رقمًا، أو للأطفال: رقم ولي الأمر + كود (مثال: 29801010101234-C01)';
  }
  return null;
}

export function getNationalIdValidationError(card: string | null | undefined): string | null {
  if (!card?.trim()) return 'الرقم القومي مطلوب';
  return getNationalIdFormatError(card);
}

export function buildChildNationalId(parentId: string, childCode: string): string | null {
  const parent = parentId.replace(/\D/g, '').slice(0, 14);
  if (parent.length !== 14) return null;
  const code = childCode.replace(/\D/g, '').padStart(2, '0').slice(-2);
  return `${parent}-C${code}`;
}

/** Ensure member exists before linking to subscription/receipt. */
export async function assertMemberExists(
  prisma: { club_members: { findFirst: (args: object) => Promise<{ id: number; name: string; card_number: string | null } | null> } },
  memberId: number | null | undefined,
): Promise<{ id: number; name: string; card_number: string | null }> {
  if (!memberId || memberId <= 0) throw new Error('كود العضو غير صالح');
  const member = await prisma.club_members.findFirst({
    where: { id: memberId, is_deleted: false },
    select: { id: true, name: true, card_number: true },
  });
  if (!member) throw new Error('العضو غير موجود');
  return member;
}

export function getEmailValidationError(email: string | null | undefined): string | null {
  if (!email?.trim()) return null;
  if (!EMAIL_REGEX.test(email.trim())) return 'صيغة البريد الإلكتروني غير صحيحة';
  return null;
}

export function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function computeSubscriptionStatus(startDate: string, endDate: string): 'active' | 'expired' | 'upcoming' {
  const today = parseDateOnly(localDateString());
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (today < start) return 'upcoming';
  if (today > end) return 'expired';
  return 'active';
}

/** MySQL UNSIGNED aggregates may return bigint — normalize before arithmetic. */
export function nextSeqFromMax(maxNum: unknown): number {
  if (maxNum == null) return 1;
  if (typeof maxNum === 'bigint') return Number(maxNum) + 1;
  if (typeof maxNum === 'number') return maxNum + 1;
  const n = Number(maxNum);
  return Number.isFinite(n) ? n + 1 : 1;
}

/** Legacy member code: configured branch letter + 6-digit sequence (e.g. A012253). */
export function formatBranchMemberCode(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(6, '0')}`;
}
