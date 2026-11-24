/**
 * Masking for contact details and identity documents.
 *
 * The point of masking is to stop a screenshot of a list being worth anything, so the
 * masking happens on the way *out of the API*: an unauthorised caller never receives the
 * real value, only stars. Hiding it in the browser would leave the number sitting in the
 * network tab, which defeats the exercise entirely.
 *
 * A masked value keeps its shape — same length, last two digits visible — so staff can
 * still tell two members apart and read a number back to a colleague without unmasking.
 */

/** Characters revealed at the end of a masked phone, enough to disambiguate a list. */
const PHONE_TAIL = 2;

export function maskPhone(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value);
  if (!s.trim()) return s;
  if (s.length <= PHONE_TAIL) return '*'.repeat(s.length);
  return '*'.repeat(s.length - PHONE_TAIL) + s.slice(-PHONE_TAIL);
}

/** Identity documents reveal nothing — there is no list-scanning use for a partial one. */
export function maskSensitive(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value);
  if (!s.trim()) return s;
  return '*'.repeat(s.length);
}

/**
 * Every name a customer's number travels under in a list row. Masking by key means a new
 * list cannot ship a number in full just because its mapper spelled the field differently.
 */
export const PHONE_FIELD_KEYS = [
  'phone',
  'memberPhone',
  'customerPhone',
  'guardianPhone',
  'emergencyPhone',
  'inviteePhone',
] as const;

/** Returns a copy of the row with every phone-ish field replaced by stars. */
export function maskPhoneFields<T extends Record<string, unknown>>(
  row: T,
  keys: readonly string[] = PHONE_FIELD_KEYS,
): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) {
    if (k in out && typeof out[k] === 'string') out[k] = maskPhone(out[k] as string);
  }
  return out as T;
}

/** True when the value looks like something this module already masked. */
export function isMasked(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.includes('*');
}
