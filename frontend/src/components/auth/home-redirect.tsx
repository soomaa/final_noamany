import { Navigate } from 'react-router-dom';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { useHomeRoute } from '@/hooks/use-permission';

/** Sends the user to their role-aware landing route from `/me/workspace`. */
export function HomeRedirect() {
  const { homeRoute, isLoading } = useHomeRoute();
  if (isLoading) return <PageSkeleton />;
  return <Navigate to={homeRoute} replace />;
}
