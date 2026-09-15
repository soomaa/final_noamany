import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    // Role changes may be made from another signed-in session. Keep revocations
    // convergent even when the affected employee leaves the same page open.
    refetchInterval: 10_000,
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
    queryFn: async () => (await api.get<WorkspaceConfig>('/me/workspace')).data,
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
  /** True if the user holds View on the resource that owns `route` (unmapped routes are open — for the route guard so utility pages like /profile stay reachable). */
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
    (pathname: string): string | null => {
      let bestKey: string | null = null;
      let bestLen = -1;
      for (const [route, resourceKey] of Object.entries(routeMap)) {
        if ((pathname === route || pathname.startsWith(route + '/')) && route.length > bestLen) {
          bestLen = route.length;
          bestKey = resourceKey;
        }
      }
      return bestKey;
    },
    [routeMap],
  );

  const canRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      if (data.superAdmin) return true;
      const bestKey = resourceForRoute(pathname);
      if (!bestKey) return true; // unmapped route → open (utility pages: /profile, /notifications…)
      return keys.has(`${bestKey}:view`);
    },
    [data, keys, resourceForRoute],
  );

  const canNavRoute = useCallback(
    (pathname: string) => {
      if (!data) return false;
      if (data.superAdmin) return true;
      const bestKey = resourceForRoute(pathname);
      if (!bestKey) return false; // unmapped → hidden from the menu (must be catalogued to appear)
      return keys.has(`${bestKey}:view`);
    },
    [data, keys, resourceForRoute],
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
