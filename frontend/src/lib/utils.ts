import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Locale } from '@/store/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert a #RRGGBB hex to an rgba() string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Convert Western digits to Arabic-Indic for Arabic locale display. */
const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const LOCALE_KEY = 'one80_locale';

export function toArabicDigits(value: string | number): string {
  try {
    if (localStorage.getItem(LOCALE_KEY) === 'en') return String(value);
  } catch {
    // SSR / tests
  }
  return String(value).replace(/[0-9]/g, (d) => arabicDigits[Number(d)]);
}

/** Convert Arabic-Indic / Persian digits to Western for API payloads. */
export function toWesternDigits(value: string | number): string {
  return String(value)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
}

export function formatDigits(value: string | number, locale: Locale = 'ar'): string {
  return locale === 'ar' ? toArabicDigits(value) : String(value);
}

/** @deprecated Use formatDigits(value, locale) */
export { toArabicDigits as toLocaleDigits };

export function initials(name?: string | null, locale: Locale = 'ar'): string {
  const fallback = locale === 'ar' ? '؟' : '?';
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? '') + (parts[1][0] ?? '');
}
