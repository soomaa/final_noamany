export type LocaleDictionary = Record<string, unknown>;

const overlays: Record<'ar' | 'en', LocaleDictionary[]> = { ar: [], en: [] };

export function registerLocaleDictionary(
  locale: 'ar' | 'en',
  dictionary: LocaleDictionary,
): void {
  overlays[locale].push(dictionary);
}

export function localeDictionaryOverlays(locale: 'ar' | 'en'): LocaleDictionary[] {
  return overlays[locale];
}
