// Permission payloads are immutable query data. Sharing this cache across the
// controls avoids scanning the entire catalog for every button on every render.
// A refreshed routeMap gets its own cache, including after a role change.
const owners = new WeakMap<Readonly<Record<string, string>>, Map<string, string | null>>();

export function permissionRouteOwner(
  routeMap: Readonly<Record<string, string>>,
  pathname: string,
): string | null {
  let paths = owners.get(routeMap);
  if (!paths) {
    paths = new Map();
    owners.set(routeMap, paths);
  }
  if (paths.has(pathname)) return paths.get(pathname)!;

  let owner: string | null = null;
  let length = -1;
  for (const [route, resource] of Object.entries(routeMap)) {
    if ((pathname === route || pathname.startsWith(route + '/')) && route.length > length) {
      owner = resource;
      length = route.length;
    }
  }
  // Routes with record IDs must not grow the cache for an entire login session.
  if (paths.size >= 256) paths.clear();
  paths.set(pathname, owner);
  return owner;
}
