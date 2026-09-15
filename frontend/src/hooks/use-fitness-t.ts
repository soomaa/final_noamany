import { useCallback } from 'react';
import { useLocale } from '@/store/locale';

/** Typed helper for `fitness.*` locale keys. */
export function useFitnessT() {
  const { t } = useLocale();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => t(`fitness.${key}`, vars),
    [t],
  );
}
