import { useEffect, useState } from 'react';
import { getTopSectionRoutes, MAX_QUICK_ACCESS, NAV_VISIT_EVENT } from '@/lib/nav-visit-tracker';

export function useSectionQuickAccess(
  sectionId: string,
  allowed: string[],
  fallback: string[],
): string[] {
  const allowedKey = allowed.join('\0');
  const fallbackKey = fallback.join('\0');

  const [routes, setRoutes] = useState(() =>
    getTopSectionRoutes(sectionId, allowed, fallback, MAX_QUICK_ACCESS),
  );

  useEffect(() => {
    const update = () =>
      setRoutes(getTopSectionRoutes(sectionId, allowed, fallback, MAX_QUICK_ACCESS));
    update();
    window.addEventListener(NAV_VISIT_EVENT, update);
    return () => window.removeEventListener(NAV_VISIT_EVENT, update);
  }, [sectionId, allowedKey, fallbackKey, allowed, fallback]);

  return routes;
}
