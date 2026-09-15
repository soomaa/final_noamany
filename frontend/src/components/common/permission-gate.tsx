import { useAuth } from '@/store/auth';
import type { ReactNode } from 'react';

interface PermissionGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  minLevel?: number;
}

/** Client-side gate — server RBAC is authoritative */
export function PermissionGate({ children, fallback = null, minLevel }: PermissionGateProps) {
  const { user } = useAuth();
  if (minLevel != null && (user?.level ?? 99) > minLevel) return <>{fallback}</>;
  return <>{children}</>;
}
