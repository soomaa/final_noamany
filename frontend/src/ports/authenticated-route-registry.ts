const PORTABLE_UTILITY_ROUTES = ['/profile', '/notifications'];
const hostRoutes = new Set<string>();
const hostPrefixes = new Set<string>();

export function registerAuthenticatedHostRoutes(options: {
  routes?: readonly string[];
  prefixes?: readonly string[];
}): void {
  options.routes?.forEach((route) => hostRoutes.add(route));
  options.prefixes?.forEach((prefix) => hostPrefixes.add(prefix));
}

export function isAuthenticatedUtilityRoute(pathname: string): boolean {
  return PORTABLE_UTILITY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  ) || [...hostPrefixes].some((prefix) => pathname.startsWith(prefix)) || hostRoutes.has(pathname);
}
