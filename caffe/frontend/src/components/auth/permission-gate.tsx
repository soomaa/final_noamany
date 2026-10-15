import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';

interface PermissionGateProps {
  /** required permission key(s) `resource:action`. OR logic across an array. */
  require: string | string[];
  children: ReactNode;
  /** what to render when denied. Defaults to nothing (element fully hidden). */
  fallback?: ReactNode;
}

/**
 * Hide UI the user lacks permission for. Use for sections, tabs, and action buttons.
 * Example:  <PermissionGate require="employees.list:create"><Button>…</Button></PermissionGate>
 */
export function PermissionGate({ require, children, fallback = null }: PermissionGateProps) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const keys = Array.isArray(require) ? require : [require];
  const ok = keys.some((k) => can(k));
  return <>{ok ? children : fallback}</>;
}

/** Centered "no access" message for a forbidden page/section. */
export function PermissionForbidden({ message }: { message?: string }) {
  const { ui } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {message ?? ui('ليس لديك صلاحية للوصول إلى هذا القسم.')}
      </p>
    </div>
  );
}
