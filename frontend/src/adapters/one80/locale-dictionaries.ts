import clubAr from '@/locales/club.ar.json';
import clubEn from '@/locales/club.en.json';
import fitnessAr from '@/locales/fitness.ar.json';
import fitnessEn from '@/locales/fitness.en.json';
import ar from '@/locales/ar.json';
import en from '@/locales/en.json';
import uiMap from '@/locales/ui-map.json';
import { registerLocaleDictionary } from '@/ports/locale-dictionary-registry';
import { registerUiTranslationMap } from '@/ports/ui-translation-registry';

export function installOne80LocaleDictionaries(): void {
  registerLocaleDictionary('ar', { ...ar, club: clubAr, fitness: fitnessAr });
  registerLocaleDictionary('en', { ...en, club: clubEn, fitness: fitnessEn });
  registerUiTranslationMap(uiMap);
}
