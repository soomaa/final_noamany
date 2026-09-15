export const PERSISTENT_SCANNER_STORAGE_KEY = 'noamany.persistent-scanner.open';

export function readPersistentScannerOpen(value: string | null) {
  return value === '1';
}

export function buildReceptionScanUrl(rawCode: string) {
  const code = rawCode.trim();
  if (!code) return null;
  return `/club/reception?scan=${encodeURIComponent(code)}`;
}

type PersistentScanContext = 'reception' | 'staff' | 'classes' | 'pos';

function persistentScanContext(pathname: string, search = ''): PersistentScanContext {
  const tab = new URLSearchParams(search).get('tab');
  if (
    (pathname === '/club/members/barcode-management' && tab === 'staff')
    || pathname === '/attendance'
    || pathname.startsWith('/attendance/')
  ) return 'staff';
  if (
    (pathname === '/club/members/barcode-management' && tab === 'classes')
    || pathname === '/club/fitness/classes'
    || pathname.startsWith('/club/fitness/classes/')
    || pathname === '/club/subscriptions/special'
    || pathname.startsWith('/club/subscriptions/special/')
  ) return 'classes';
  if (pathname === '/sales' || pathname.startsWith('/sales/')) return 'pos';
  return 'reception';
}

export function persistentScannerPermissionKeys(pathname: string, search = ''): string[] {
  const context = persistentScanContext(pathname, search);
  if (context === 'staff') return ['attendance:view'];
  if (context === 'classes') return ['club.fitness:update', 'club.subscriptions.special:update'];
  if (context === 'pos') return ['gym-sales.sales.new_receipt:view'];
  return ['club.reception:view', 'club.members:view'];
}

export function operationalBarcodeRoutePermissionKeys(pathname: string, search = ''): string[] {
  if (pathname !== '/club/members/barcode-management') return [];
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'staff') return ['attendance:view'];
  if (tab === 'classes') return ['club.fitness:update', 'club.subscriptions.special:update'];
  return [];
}

/**
 * The provider owns the one global keyboard listener. It does not guess from a
 * barcode; it preserves the screen the operator is already working in and
 * passes the code to that screen's existing scan flow.
 */
export function buildPersistentScanUrl(rawCode: string, pathname: string, search = '') {
  const code = rawCode.trim();
  if (!code) return null;
  const encoded = encodeURIComponent(code);
  const context = persistentScanContext(pathname, search);
  if (context === 'reception') {
    return `/club/reception?scan=${encoded}`;
  }
  if (context === 'staff') return `/club/members/barcode-management?tab=staff&scan=${encoded}`;
  if (context === 'classes') return `/club/members/barcode-management?tab=classes&scan=${encoded}`;
  if (context === 'pos') {
    return `/sales/new?memberScan=${encoded}`;
  }
  return null;
}

export function consumeReceptionScanSearch(rawSearch: string) {
  const params = new URLSearchParams(rawSearch);
  const code = params.get('scan')?.trim() || null;
  params.delete('scan');
  const remaining = params.toString();
  return { code, search: remaining ? `?${remaining}` : '' };
}

/**
 * Screens that run their own scanner gun against a different endpoint. A scan there must
 * stay on that screen instead of being pulled to reception by the app-wide listener.
 */
const SCANNER_OWNED_ROUTES = [
  '/club/events/checkin',
  '/live/checkin',
  '/live/kiosk',
  '/live/guest',
];

export function pathOwnsItsOwnScanner(pathname: string) {
  return SCANNER_OWNED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function persistentScannerAllowedPath(pathname: string) {
  return pathname !== '/login';
}

export function persistentCameraShouldOpen(open: boolean, pathname: string) {
  return open && persistentScannerAllowedPath(pathname) && !pathOwnsItsOwnScanner(pathname);
}
