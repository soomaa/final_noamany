import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { useHomeRoute, usePermission } from '@/hooks/use-permission';
import { operationalBarcodeRoutePermissionKeys } from '@/lib/persistent-scanner-model';

/**
 * Blocks direct navigation to a page the user lacks View on. Waits for the permission
 * set to load (avoids a flash of forbidden content), then redirects mapped-but-denied
 * routes to the user's role home. Unmapped routes (utility pages) pass through.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { can, canRoute, isReady, hasError, retry, refresh } = usePermission();
  const { homeRoute, isLoading: homeLoading } = useHomeRoute();
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setVerifiedPath(null);
    void refresh().finally(() => {
      if (active) setVerifiedPath(pathname);
    });
    return () => {
      active = false;
    };
  }, [pathname, refresh]);

  if (!isReady || homeLoading || verifiedPath !== pathname) return <PageSkeleton />;
  if (hasError) {
    return (
      <div className="p-6">
        <ErrorState onRetry={retry} />
      </div>
    );
  }
  const operationalScannerAllowed = operationalBarcodeRoutePermissionKeys(pathname, search).some((permission) => can(permission));
  if (!canRoute(pathname) && !operationalScannerAllowed) return <Navigate to={homeRoute} replace />;
  return <>{children}</>;
}
