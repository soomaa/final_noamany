const EGYPT_TZ = 'Africa/Cairo';

/**
 * Mobile numbers are stored as digits only.  We deliberately do not tie this
 * to a specific country: a member may enter a local number or an international
 * number with its country code (for example +971 50 123 4567).
 */
const PHONE_REGEX = /^(?=.*[1-9])\d{7,15}$/;
const PHONE_FORMAT_ERROR =
  'رقم الموبايل غير صحيح — أدخل من 7 إلى 15 رقمًا، مع رمز الدولة عند الحاجة (مثال: +971 50 123 4567)';
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

/** Match Arabic/Persian digits and mixed-case scanner codes consistently across screens. */
export function normalizeMemberSearchQuery(value: string): string {
  const query = normalizeName(value ?? '')
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  return /^[a-z]{1,3}\d+$/i.test(query) ? query.toUpperCase() : query;
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
  prisma: {
    club_members: {
      findFirst: (args: object) => Promise<{
        id: number;
        name: string;
        card_number: string | null;
        branch_id: number;
      } | null>;
    };
  },
  memberId: number | null | undefined,
): Promise<{ id: number; name: string; card_number: string | null; branch_id: number }> {
  if (!memberId || memberId <= 0) throw new Error('كود العضو غير صالح');
  const member = await prisma.club_members.findFirst({
    where: { id: memberId, is_deleted: false },
    select: { id: true, name: true, card_number: true, branch_id: true },
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

/**
 * Branch prefix for member codes / barcodes.
 * Branch 1 -> "A", 2 -> "B", ... 26 -> "Z", 27 -> "AA", 28 -> "AB", ...
 * So every branch's members get a distinct leading letter (e.g. A000123, B000045).
 */
/** MySQL UNSIGNED aggregates may return bigint — normalize before arithmetic. */
export function nextSeqFromMax(maxNum: unknown): number {
  if (maxNum == null) return 1;
  if (typeof maxNum === 'bigint') return Number(maxNum) + 1;
  if (typeof maxNum === 'number') return maxNum + 1;
  const n = Number(maxNum);
  return Number.isFinite(n) ? n + 1 : 1;
}

export function branchCodePrefix(branchId: number): string {
  let n = Math.max(1, Math.floor(branchId));
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Legacy member code: branch letter(s) + 6-digit sequence (e.g. A012253 for branch 1). */
export function formatBranchMemberCode(branchId: number, seq: number): string {
  return `${branchCodePrefix(branchId)}${String(seq).padStart(6, '0')}`;
}

/** Indexed prefixes for numeric input, including ONE80's padded branch codes. */
export function memberCodeSearchTerms(query: string, branchIds: number[] | null) {
  const exact = new Set([query]);
  const prefixes = new Set([query]);
  if (/^\d{1,6}$/.test(query)) {
    for (const branchId of branchIds ?? []) {
      const prefix = branchCodePrefix(branchId);
      exact.add(`${prefix}${query.padStart(6, '0')}`);
      for (let width = query.length; width <= 6; width++) {
        prefixes.add(`${prefix}${query.padStart(width, '0')}`);
      }
    }
  }
  return { exact: [...exact], prefixes: [...prefixes] };
}

export function memberCodeSearchRank(code: string, query: string): number {
  const lower = code.toLowerCase();
  const needle = query.toLowerCase();
  if (lower === needle) return 0;
  if (/^\d{1,6}$/.test(query)) {
    const digits = code.match(/^[a-z]{1,3}(\d{6})$/i)?.[1];
    if (digits === query.padStart(6, '0')) return 0;
    const numericPart = digits?.replace(/^0+(?=\d)/, '');
    if (digits?.startsWith(query) || numericPart?.startsWith(query.replace(/^0+(?=\d)/, ''))) return 1;
  }
  if (lower.startsWith(needle)) return 1;
  if (lower.includes(needle)) return 2;
  return 3;
}
