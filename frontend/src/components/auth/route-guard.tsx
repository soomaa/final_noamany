import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { useHomeRoute, usePermission } from '@/hooks/use-permission';

/**
 * Blocks direct navigation to a page the user lacks View on, then redirects mapped-but-denied
 * routes to the user's role home. Unmapped routes (utility pages) pass through.
 *
 * Only the very first load waits for the permission set. After that the cached set (polled
 * every few seconds) authorises the page at once and a fresh copy is fetched in the
 * background on every navigation: a revoked page redirects as soon as it arrives, and the API
 * refuses the page's data regardless. Waiting for that round-trip on every click left the
 * whole page on a skeleton whenever the request was slow or stalled behind other requests.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { canRoute, hasData, hasError, retry, refresh } = usePermission();
  const { homeRoute, isLoading: homeLoading } = useHomeRoute();

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  if (!hasData) {
    if (hasError) {
      return (
        <div className="p-6">
          <ErrorState onRetry={retry} />
        </div>
      );
    }
    return <PageSkeleton />;
  }
  if (!canRoute(pathname)) {
    // The redirect target comes from the workspace; wait for it rather than guessing.
    if (homeLoading) return <PageSkeleton />;
    return <Navigate to={homeRoute} replace />;
  }
  return <>{children}</>;
}
