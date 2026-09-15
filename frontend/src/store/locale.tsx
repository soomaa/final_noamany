import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import clubAr from '@/locales/club.ar.json';
import clubEn from '@/locales/club.en.json';
import fitnessAr from '@/locales/fitness.ar.json';
import fitnessEn from '@/locales/fitness.en.json';
import arShared from '@/locales/shared.ar.json';
import enShared from '@/locales/shared.en.json';
import { mergeLocales } from '@/lib/i18n-merge';
import { translateUiText } from '@/lib/ui-translate';
import { getUiStaticMap, setUiStaticMap } from '@/lib/ui-static';

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

const dictionaries: Record<Locale, Record<string, unknown>> = {
  ar: mergeLocales(ar, arShared, { club: clubAr, fitness: fitnessAr }),
  en: mergeLocales(en, enShared, { club: clubEn, fitness: fitnessEn }),
};

const STORAGE_KEY = 'one80_locale';

interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  isRtl: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: TFunction;
  /** Translate inline Arabic UI copy when locale is English. */
  ui: (text: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function resolve(obj: Record<string, unknown>, key: string): string | undefined {
  if (key.startsWith('nav.routes.')) {
    const path = key.slice('nav.routes.'.length);
    const routes = (obj.nav as Record<string, unknown> | undefined)?.routes as
      | Record<string, string>
      | undefined;
    if (routes && path in routes) return routes[path];
  }

  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
  return typeof value === 'string' ? value : undefined;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    return saved === 'en' || saved === 'ar' ? saved : 'ar';
  });
  const [uiMap, setUiMap] = useState<Record<string, string>>(() => getUiStaticMap());

  const dir: Direction = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', locale);
    root.setAttribute('dir', dir);
    localStorage.setItem(STORAGE_KEY, locale);
    document.title = resolve(dictionaries[locale], 'app.title') ?? document.title;
  }, [locale, dir]);

  useEffect(() => {
    if (locale !== 'en' || Object.keys(uiMap).length > 0) return;
    let active = true;
    void import('@/locales/ui-map.json').then((module) => {
      if (active) {
        const map = module.default as Record<string, string>;
        setUiStaticMap(map);
        setUiMap(map);
      }
    });
    return () => {
      active = false;
    };
  }, [locale, uiMap]);

  const t = useCallback<TFunction>(
    (key, vars) => {
      let value = resolve(dictionaries[locale], key) ?? resolve(dictionaries.ar, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          const str = String(v);
          // Support both {{var}} (app locales) and {var} (club/fitness locales).
          value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), str);
          value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), str);
        }
      }
      return value;
    },
    [locale],
  );

  const ui = useCallback(
    (text: string) => translateUiText(text, locale, uiMap),
    [locale, uiMap],
  );

  // Persist before React renders the next language. A small set of legacy helpers reads
  // the locale synchronously from storage; updating storage only in useEffect caused one
  // render where the shell was English while dashboard cards were still Arabic.
  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);
  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next: Locale = current === 'ar' ? 'en' : 'ar';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ locale, dir, isRtl: dir === 'rtl', setLocale, toggleLocale, t, ui }),
    [locale, dir, setLocale, toggleLocale, t, ui],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useT() {
  return useLocale().t;
}

export function useUi() {
  return useLocale().ui;
}
