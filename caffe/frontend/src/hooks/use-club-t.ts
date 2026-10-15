import { useCallback } from 'react';
import { useLocale } from '@/store/locale';

/** Typed helper for `club.*` locale keys. */
export function useClubT() {
  const { t } = useLocale();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => t(`club.${key}`, vars),
    [t],
  );
}
