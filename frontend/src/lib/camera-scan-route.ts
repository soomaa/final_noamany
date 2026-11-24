/**
 * Where a card scanned with the topbar camera goes (ported from Gymora's persistent-scanner-model).
 * Reception opens the member from `?scan=<code>`.
 */
export function buildReceptionScanUrl(rawCode: string) {
  const code = rawCode.trim();
  return `/club/reception?scan=${encodeURIComponent(code)}`;
}

/**
 * Screens that read a card themselves (their own camera button and scanner input, or a different
 * endpoint such as event check-in). The topbar camera is hidden there so a scan is not pulled to
 * reception.
 */
const SCANNER_OWNED_PAGES = ['/club/reception', '/club/attendance'];

export function pathOwnsItsOwnScanner(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return SCANNER_OWNED_PAGES.includes(path) || /\/live\/(checkin|kiosk|guest)/.test(path);
}
