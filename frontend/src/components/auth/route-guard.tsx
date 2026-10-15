import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { useHomeRoute, usePermission } from '@/hooks/use-permission';
import { canOpenCompletedInvoiceEditor } from '@/lib/invoice-editor-access';

/**
 * Blocks direct navigation to a page the user lacks View on. Waits for the permission
 * set to load (avoids a flash of forbidden content), then redirects mapped-but-denied
 * routes to the user's role home. Unmapped routes (utility pages) pass through.
 * Existing invoice edits may enter POS through their invoice-page View + Update grants.
 *
 * Re-verification is keyed on the PATHNAME only. It used to include the query string, so
 * every `?tab=`/filter change tore the page down to a skeleton and refetched the permission
 * set — on-screen that read as the whole page reloading each time a tab was clicked. The
 * query string never changes which route is being guarded; the checks below still read the
 * live `search` on every render, so the invoice-editor case is unaffected.
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
  if (!canRoute(pathname) && !canOpenCompletedInvoiceEditor(pathname, search, can)) {
    return <Navigate to={homeRoute} replace />;
  }
  return <>{children}</>;
}
