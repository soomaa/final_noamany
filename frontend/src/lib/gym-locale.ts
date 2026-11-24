/**
 * Noamany is one Egyptian gym with no tenant branding cache (MetaFit reads country, currency
 * and time zone from it), so every value falls back to Egypt: EGP, Africa/Cairo.
 */
const getBrand = (): { country?: string; currency?: string; timezone?: string; timeZone?: string } | null => null;

export type GymCountry = 'EG' | 'SA';

const CURRENCY_LABELS: Record<string, { ar: string; en: string }> = {
  EGP: { ar: 'ج.م', en: 'EGP' },
  SAR: { ar: 'ر.س', en: 'SAR' },
  AED: { ar: 'د.إ', en: 'AED' },
  KWD: { ar: 'د.ك', en: 'KWD' },
};

/** The gym's country — Saudi gyms print VAT tax invoices. Unknown/old caches are Egyptian. */
export function gymCountry(): GymCountry {
  return getBrand()?.country === 'SA' ? 'SA' : 'EG';
}

export function isSaudiGym(): boolean {
  return gymCountry() === 'SA';
}

/** ISO currency code of the gym (EGP when unknown). */
export function gymCurrency(): string {
  const code = String(getBrand()?.currency ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : gymCountry() === 'SA' ? 'SAR' : 'EGP';
}

/** Short currency label for amounts: «ر.س» / «SAR» for a Saudi gym, «ج.م» / «EGP» for an Egyptian one. */
export function gymCurrencyLabel(lang: 'ar' | 'en' = 'ar'): string {
  const code = gymCurrency();
  return CURRENCY_LABELS[code]?.[lang] ?? code;
}

/** The gym's IANA timezone (Cairo when unknown). */
export function gymTimeZone(): string {
  const zone = getBrand()?.timezone;
  if (!zone) return 'Africa/Cairo';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return zone;
  } catch {
    return 'Africa/Cairo';
  }
}

const CURRENCY_WORDS: Record<string, { word: string; inWord: string }> = {
  SAR: { word: 'ريال', inWord: 'بالريال' },
  AED: { word: 'درهم', inWord: 'بالدرهم' },
  KWD: { word: 'دينار', inWord: 'بالدينار' },
};

/** Currency label in the interface language (stored locale), e.g. «ر.س» or «SAR». */
export function gymCurrencyText(): string {
  let lang: 'ar' | 'en' = 'ar';
  try { lang = localStorage.getItem('gymora_locale') === 'en' ? 'en' : 'ar'; } catch { /* private mode */ }
  return gymCurrencyLabel(lang);
}

/**
 * Rewrites an Egyptian-pound label (already translated) for the gym's currency:
 * «ج.م» → «ر.س», «جنيه» → «ريال», «EGP» → «SAR». Egyptian gyms get the text unchanged.
 */
export function localizeCurrency(text: string): string {
  const code = gymCurrency();
  if (code === 'EGP') return text;
  const words = CURRENCY_WORDS[code];
  let out = text.replace(/ج\.م/g, gymCurrencyLabel('ar')).replace(/\bEGP\b/g, code);
  if (words) out = out.replace(/بالجنيه/g, words.inWord).replace(/جنيه/g, words.word);
  return out;
}


/** Rewrites «رقم قومي / الرقم القومي» inside a sentence for Saudi gyms. */
export function localizeNationalId(text: string): string {
  if (!isSaudiGym()) return text;
  return text.replace(/الرقم القومي/g, 'رقم الهوية').replace(/رقم قومي/g, 'رقم هوية').replace(/[Nn]ational ID/g, 'ID / Iqama');
}
