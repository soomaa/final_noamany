export function personalPortalPermission(pathname: string, permissionKeys: ReadonlySet<string>): boolean {
  if (pathname === '/trainer') return permissionKeys.has('trainer.portal:view');
  if (pathname === '/sales-portal' || pathname.startsWith('/sales-portal/')) return permissionKeys.has('sales.portal:view');
  return false;
}

const SALES_MANAGEMENT_ROUTES = new Set([
  '/club/sales-dashboard',
  '/club/sales-reports',
  '/club/sales-settings',
]);

/** Direct pages that share the sales-management permission family. */
export function isSalesManagementRoute(pathname: string): boolean {
  return SALES_MANAGEMENT_ROUTES.has(pathname);
}

export function deniedRouteDestination(pathname: string, homeRoute: string): string | null {
  return pathname === homeRoute ? null : homeRoute;
}
