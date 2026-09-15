import { format, parseISO, isValid } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { formatDigits } from '@/lib/utils';
import type { Locale } from '@/store/locale';

const STORAGE_KEY = 'one80_locale';

export function getStoredLocale(): Locale {
  try {
    const l = localStorage.getItem(STORAGE_KEY);
    return l === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

function dateFnsLocale(locale: Locale) {
  return locale === 'en' ? enUS : ar;
}

export function formatMoney(
  value: number | string | null | undefined,
  currency?: string,
  locale: Locale = getStoredLocale(),
): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '—';
  const numLocale = locale === 'en' ? 'en-US' : 'ar-EG';
  const curr = currency ?? (locale === 'en' ? 'EGP' : 'ج.م');
  const formatted = new Intl.NumberFormat(numLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatDigits(formatted, locale)} ${curr}`;
}

export function formatNum(
  value: number | string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (value == null || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n)) return '—';
  const numLocale = locale === 'en' ? 'en-US' : 'ar-SA';
  return formatDigits(new Intl.NumberFormat(numLocale).format(n), locale);
}

/** YYYY-MM-DD from the LOCAL calendar day (never use toISOString().slice(0,10) — it shifts to UTC) */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date as YYYY-MM-DD in the user's local timezone */
export function localToday(): string {
  return localDateStr(new Date());
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'yyyy/MM/dd',
  locale: Locale = getStoredLocale(),
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(d)) return '—';
  return formatDigits(format(d, pattern, { locale: dateFnsLocale(locale) }), locale);
}

/** Hijri display placeholder — derived from Gregorian for UI parity with legacy dual-date fields */
export function formatHijriDisplay(
  gregorian: string | null | undefined,
  locale: Locale = getStoredLocale(),
): string {
  if (!gregorian) return '—';
  return formatDigits(gregorian, locale);
}

export function formatTime(
  value: string | Date | null | undefined,
  locale: Locale = getStoredLocale(),
  options: { seconds?: boolean } = {},
): string {
  if (!value) return '—';
  if (value instanceof Date) return formatTimeFromDate(value, locale, options);

  const raw = value.trim();
  const legacyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/.exec(raw);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!legacyMatch && !timeMatch) {
    const parsed = parseISO(raw);
    return isValid(parsed) ? formatTimeFromDate(parsed, locale, options) : formatDigits(raw, locale);
  }

  const match = legacyMatch ?? timeMatch!;
  let h24 = Number(match[1]);
  const min = match[2];
  const seconds = match[3] ?? '00';
  if (legacyMatch) {
    h24 %= 12;
    if (legacyMatch[4].toLowerCase() === 'pm') h24 += 12;
  }
  if (!Number.isFinite(h24) || h24 < 0 || h24 > 23) return formatDigits(value, locale);
  const period = h24 >= 12 ? (locale === 'ar' ? 'م' : 'PM') : (locale === 'ar' ? 'ص' : 'AM');
  const h12 = h24 % 12 || 12;
  return formatDigits(`${h12}:${min}${options.seconds ? `:${seconds}` : ''} ${period}`, locale);
}

/** Formats a timestamp's clock portion explicitly in 12-hour time. */
export function formatTimeFromDate(
  value: string | Date | null | undefined,
  locale: Locale = getStoredLocale(),
  options: { seconds?: boolean } = {},
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return '—';
  const result = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-EG', {
    hour: 'numeric',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' as const } : {}),
    hour12: true,
  }).format(date);
  return formatDigits(result, locale);
}

/** Formats a date and time without ever exposing a 24-hour clock to the user. */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: Locale = getStoredLocale(),
  options: { seconds?: boolean } = {},
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(date)) return '—';
  const result = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' as const } : {}),
    hour12: true,
  }).format(date);
  return formatDigits(result, locale);
}
