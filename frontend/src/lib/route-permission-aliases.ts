import { CLUB_ROUTES as CR } from '@/lib/club-routes';

/**
 * Pages that combine several catalogued pages as tabs. The combined route has no RBAC
 * resource of its own: it is open to a user who can view any of the listed routes, and
 * each tab is shown only when its own route is viewable.
 */
export const ROUTE_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  [CR.members.checkIn]: [
    CR.members.barcodeMemberCheckIn,
    CR.members.barcodeSpaCheckIn,
    CR.members.barcodeClassesCheckIn,
  ],
};

/** The routes whose View grants access to `pathname`, when it is a combined page. */
export function routePermissionAlias(pathname: string): readonly string[] | undefined {
  for (const [route, routes] of Object.entries(ROUTE_PERMISSION_ALIASES)) {
    if (pathname === route || pathname.startsWith(route + '/')) return routes;
  }
  return undefined;
}
