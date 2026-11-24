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
  // Roles list (delete unused roles) is part of the roles & permissions page.
  '/admin/role-list': ['/admin/roles'],
  // Staff setup (section + job title per employee) is part of the roles & permissions page too.
  '/admin/staff-setup': ['/admin/roles'],
  // The sales overview link opens /club/sales-reports (ported from MetaFit).
  [CR.sales.dashboard]: [CR.sales.team],
  [CR.sales.settings]: [CR.sales.team],
};

/** The routes whose View grants access to `pathname`, when it is a combined page. */
export function routePermissionAlias(pathname: string): readonly string[] | undefined {
  for (const [route, routes] of Object.entries(ROUTE_PERMISSION_ALIASES)) {
    if (pathname === route || pathname.startsWith(route + '/')) return routes;
  }
  return undefined;
}
