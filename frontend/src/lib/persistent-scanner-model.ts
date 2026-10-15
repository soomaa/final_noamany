export const PERSISTENT_SCANNER_STORAGE_KEY = 'one80.reception.scanner.open';

export interface PersistentScanRequest {
  id: number;
  code: string;
}

export function createPersistentScanRequest(
  rawCode: string,
  previousId: number,
): PersistentScanRequest | null {
  const code = rawCode.trim();
  return code ? { id: previousId + 1, code } : null;
}

export function readPersistentScannerOpen(value: string | null) {
  return value === '1';
}

export function buildReceptionScanUrl(rawCode: string): string | null {
  const code = rawCode.trim();
  return code ? `/club/reception?scan=${encodeURIComponent(code)}` : null;
}

const SCANNER_OWNED_ROUTES = [
  '/club/events/checkin',
  '/live/checkin',
  '/live/kiosk',
  '/live/guest',
];

export function pathOwnsItsOwnScanner(pathname: string) {
  return SCANNER_OWNED_ROUTES.some((route) => pathname.includes(route));
}
