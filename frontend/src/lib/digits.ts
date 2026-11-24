/**
 * Digit extraction that understands the digits this app actually shows.
 *
 * FIT90 renders every number in Arabic-Indic digits (`toArabicDigits`), so a number copied
 * off one screen and pasted into a form arrives as `٠١٥٥٣١٣٤٨٢٧`. A plain `\D` strip
 * matches none of those characters and returns an empty string, which is how an ordinary
 * Egyptian mobile came back as "malformed". Persian (Eastern Arabic-Indic) forms show up
 * from some phone keyboards, so they are mapped too.
 */
const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Latin, Arabic-Indic and Eastern Arabic-Indic digits; everything else dropped. */
export function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[٠-٩۰-۹]/g, (c) => DIGIT_MAP[c] ?? '')
    .replace(/\D/g, '');
}
