import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { FINANCE_ROUTES, canViewFinanceStatement } from '@/lib/finance-routes';
import { isSalesManagementRoute, personalPortalPermission } from '@/lib/portal-route-access';
import { safeInternalPath } from '@/lib/navigation-safety';
import { useAuth } from '@/store/auth';
import { isAuthenticatedUtilityRoute } from '@/ports/authenticated-route-registry';
import { permissionRouteOwner } from '@/lib/permission-route-owner';

export interface MyPermissions {
  superAdmin: boolean;
  keys: string[];
  routeMap: Record<string, string>;
  resourceActions: Record<string, string[]>;
  scope: Record<string, string>;
}

export interface NavApiNode {
  key: string;
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  type: 'module' | 'group' | 'page';
  clickable: boolean;
  children: NavApiNode[];
}

export interface WorkspaceConfig {
  homeRoute: string;
  roleHint: string;
  widgets: string[];
}

/** The user's resolved permission set (cached; refetched on auth changes). */
export function useMyPermissions() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'permissions'],
    queryFn: async () => (await api.get<MyPermissions>('/me/permissions')).data,
    enabled: status === 'authenticated',
    // Every DataTable, Button and nav item reads this hook, so `staleTime: 0` +
    // `refetchOnMount: 'always'` used to re-hit /me/permissions on every mount and
    // re-render the whole screen — pages read as if they were reloading themselves.
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // Role changes may be made from another signed-in session. Keep revocations
    // convergent even when the affected employee leaves the same page open —
    // the server stays the real gate, this only drives UI affordances.
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

export function useNav() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'nav'],
    queryFn: async () => (await api.get<NavApiNode[]>('/me/nav')).data,
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useWorkspace() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['me', 'workspace'],
    queryFn: async () => {
      const { data } = await api.get<WorkspaceConfig>('/me/workspace');
      return { ...data, homeRoute: safeInternalPath(data.homeRoute) };
    },
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

/** Role-aware landing route — super-admin → /dashboard, others → their workspace home. */
export function useHomeRoute() {
  const { data, isLoading } = useWorkspace();
  return {
    homeRoute: data?.homeRoute ?? '/profile',
    isLoading,
  };
}

export interface PermissionApi {
  /** True if the user holds `${resourceKey}:${action}` (or is super-admin). */
  can: (key: string) => boolean;
  /** True if the user holds View on the resource that owns `route`. Unknown routes fail closed; only explicit utility/redirect routes are allowed. */
  canRoute: (pathname: string) => boolean;
  /** Like canRoute but STRICT: an unmapped route is hidden. Use for menu/sidebar filtering so a page not registered in the RBAC catalog can never leak into everyone's nav. */
  canNavRoute: (pathname: string) => boolean;
  superAdmin: boolean;
  isReady: boolean;
  /** Permissions endpoint failed — routes stay blocked until retry succeeds. */
  hasError: boolean;
  retry: () => void;
  /** Force a server round-trip before authorising a newly opened route. */
  refresh: () => Promise<void>;
  routeMap: Record<string, string>;
  /** Catalog actions applicable to each resource; lets shared controls fail closed without guessing absent actions. */
  resourceActions: Record<string, string[]>;
  resourceForRoute: (pathname: string) => string | null;
}

/** Synchronous permission helpers for components and the route guard. */
export function usePermission(): PermissionApi {
  const { data, isLoading, isError, refetch } = useMyPermissions();
  const keys = useMemo(() => new Set(data?.keys ?? []), [data]);
  const routeMap = data?.routeMap ?? {};
  const resourceActions = data?.resourceActions ?? {};

  const can = useCallback(
    (key: string) => !!data?.superAdmin || keys.has(key),
    [data?.superAdmin, keys],
  );

  /** Resolve the catalog resource key that owns a route (longest matching prefix), or null if unmapped. */
  const resourceForRoute = useCallback(
    (pathname: string): string | null => permissionRouteOwner(routeMap, pathname),
    [routeMap],
  );

  const canSalesTeamRoute = useCallback(
    (pathname: string) =>
      isSalesManagementRoute(pathname)
      && (keys.has('club.sales.reports:view')
        || keys.has('club.sales.dashboard:view')
        || keys.has('club.sales.settings:view')),
    [keys],
  );

  const canRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      if (data.superAdmin) return true;
      if (pathname === FINANCE_ROUTES.dashboard && canViewFinanceStatement(keys)) return true;
      // The employee list owns the "new employee" entry point in the UI and
      // API. A role granted Create there must not be redirected merely because
      // the catalog also exposes /employees/new as a separate matrix row.
      if (
        pathname === '/employees/new'
        && (keys.has('employees.list:create') || keys.has('employees.new:create'))
      ) return true;
      if (personalPortalPermission(pathname, keys)) return true;
      if (canSalesTeamRoute(pathname)) return true;
      const bestKey = resourceForRoute(pathname);
      if (!bestKey) return isAuthenticatedUtilityRoute(pathname);
      return keys.has(`${bestKey}:view`);
    },
    [canSalesTeamRoute, data, keys, resourceForRoute],
  );

  const canNavRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      if (data.superAdmin) return true;
      if (pathname === FINANCE_ROUTES.dashboard && canViewFinanceStatement(keys)) return true;
      if (personalPortalPermission(pathname, keys)) return true;
      if (canSalesTeamRoute(pathname)) return true;
      const bestKey = resourceForRoute(pathname);
      if (!bestKey) return false; // unmapped → hidden from the menu (must be catalogued to appear)
      return keys.has(`${bestKey}:view`);
    },
    [canSalesTeamRoute, data, keys, resourceForRoute],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    can,
    canRoute,
    canNavRoute,
    superAdmin: !!data?.superAdmin,
    isReady: !isLoading && (!!data || isError),
    hasError: isError,
    retry: () => void refetch(),
    refresh,
    routeMap,
    resourceActions,
    resourceForRoute,
  };
}
