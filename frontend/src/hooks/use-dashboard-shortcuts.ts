import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_DASHBOARD_SHORTCUTS } from '@/lib/dashboard-shortcuts';

interface SavedShortcuts { routes: string[] }

const STORAGE_PREFIX = 'noamany_quick_access:';
const CHANGE_EVENT = 'noamany-quick-access-change';

function read(userId: number): string[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (raw == null) return [...DEFAULT_DASHBOARD_SHORTCUTS];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((r): r is string => typeof r === 'string'))] : [...DEFAULT_DASHBOARD_SHORTCUTS];
  } catch {
    return [...DEFAULT_DASHBOARD_SHORTCUTS];
  }
}

/**
 * The account's Quick Access pages, kept per account on this device. Pages the account
 * can no longer open are filtered out where they are shown, so a revoked page never appears.
 */
export function useDashboardShortcuts(userId: number) {
  const [routes, setRoutes] = useState(() => read(userId));

  useEffect(() => {
    const sync = () => setRoutes(read(userId));
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === `${STORAGE_PREFIX}${userId}`) sync();
    };
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const save = useCallback((next: string[]) => {
    const unique = [...new Set(next)];
    setRoutes(unique);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(unique));
    } catch {
      // Storage blocked: the selection still applies until the page is reloaded.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [userId]);

  const data: SavedShortcuts = { routes };
  return { data, save };
}
