import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { RouteGuard } from '@/components/auth/route-guard';
import { usePermission } from '@/hooks/use-permission';
import { LoginPage } from '@/pages/login';
import { useAuth } from '@/store/auth';
import { PortableShell } from './shell';
import { PORTABLE_ROUTES } from './routes';

function RequireAuth() {
  const status = useAuth((state) => state.status);
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PortableHome() {
  const { canNavRoute, isReady } = usePermission();
  if (!isReady) return <PageSkeleton />;
  const home = PORTABLE_ROUTES.find(({ path }) => !path.includes(':') && canNavRoute(path))?.path ?? '/profile';
  return <Navigate to={home} replace />;
}

export function PortableApp() {
  const { bootstrap, status } = useAuth();
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  if (status === 'idle' || status === 'loading') return <PageSkeleton />;
  return <Suspense fallback={<PageSkeleton />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<RequireAuth />}><Route element={<PortableShell />}>
      <Route index element={<PortableHome />} />
      {PORTABLE_ROUTES.map(({ path, Page }) => <Route key={path} path={path} element={<RouteGuard><Page /></RouteGuard>} />)}
      <Route path="*" element={<PortableHome />} />
    </Route></Route>
  </Routes></Suspense>;
}
