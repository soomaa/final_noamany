/**
 * A USB barcode scanner "types" the card. With Windows on the Arabic keyboard layout the
 * letter keys arrive as Arabic: B18580 becomes «لآ18580» (Shift+B) or «لا18580», A becomes an
 * invisible kasra, C becomes «}» / «ؤ». Digits may also arrive as Arabic-Indic (١٨٥٨٠).
 * When the text read back through the US layout looks like a member code (letters + digits),
 * return that code; anything else (a name, a phone number) is returned unchanged.
 */
const ARABIC_LAYOUT_SEQUENCES: Array<[string, string]> = [['لآ', 'B'], ['لأ', 'G'], ['لإ', 'T'], ['لا', 'B']];
const ARABIC_LAYOUT_KEYS: Record<string, string> = {
  // unshifted keys
  'ض': 'Q', 'ص': 'W', 'ث': 'E', 'ق': 'R', 'ف': 'T', 'غ': 'Y', 'ع': 'U', 'ه': 'I', 'خ': 'O', 'ح': 'P',
  'ش': 'A', 'س': 'S', 'ي': 'D', 'ب': 'F', 'ل': 'G', 'ا': 'H', 'ت': 'J', 'ن': 'K', 'م': 'L',
  'ئ': 'Z', 'ء': 'X', 'ؤ': 'C', 'ر': 'V', 'ى': 'N', 'ة': 'M',
  // Shift + key (what a scanner sends for capital letters)
  'َ': 'Q', 'ً': 'W', 'ُ': 'E', 'ٌ': 'R', 'إ': 'Y', '‘': 'U', '÷': 'I', '×': 'O', '؛': 'P',
  'ِ': 'A', 'ٍ': 'S', 'أ': 'H', 'ـ': 'J', '،': 'K', '~': 'Z', 'ْ': 'X', '}': 'C', '{': 'V', 'آ': 'N', '’': 'M',
};
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
const MEMBER_CODE_SHAPE = /^[A-Z]{1,3}\d{3,}$/;

export function normalizeScannedCode(raw: string): string {
  const text = raw.trim().replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10));
  if (!text) return text;
  if (MEMBER_CODE_SHAPE.test(text.toUpperCase()) && /^[A-Za-z]/.test(text)) return text.toUpperCase();
  if (!/[؀-ۿ{}~÷×‘’]/.test(text)) return text;
  let latin = text;
  for (const [seq, key] of ARABIC_LAYOUT_SEQUENCES) latin = latin.split(seq).join(key);
  latin = Array.from(latin).map((ch) => ARABIC_LAYOUT_KEYS[ch] ?? ch).join('').replace(/\s+/g, '').toUpperCase();
  return MEMBER_CODE_SHAPE.test(latin) ? latin : text;
}
