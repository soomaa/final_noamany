import uiMap from '@/locales/ui-map.json';
import { getStoredLocale } from '@/lib/formatters';
import { translateUiText } from '@/lib/ui-translate';

/** Translate Arabic UI copy using the current locale from localStorage (safe at module scope). */
export function uiStatic(text: string): string {
  if (!text) return text;
  try {
    const locale = getStoredLocale();
    const map = uiMap as Record<string, string>;
    if (locale === 'ar') {
      if (text in map) return text;
      // Module-level option lists may have been created while English was active.
      // Resolve their English value back to the canonical Arabic key on a live switch.
      const arabic = Object.entries(map).find(([, english]) => english === text)?.[0];
      return arabic ?? text;
    }
    return translateUiText(text, locale, map);
  } catch {
    return text;
  }
}

/** Build select options with labels translated at read time. */
export function uiOptions<T extends string>(
  items: readonly { value: T; label: string }[],
): { value: T; label: string }[] {
  return items.map((item) => ({ ...item, label: uiStatic(item.label) }));
}

/** Build a list of translated labels. */
export function uiLabels(labels: readonly string[]): string[] {
  return labels.map((label) => uiStatic(label));
}
