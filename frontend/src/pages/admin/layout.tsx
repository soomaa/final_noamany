import { ListChecks, ScrollText, ShieldCheck, UserCog } from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { usePermission } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface Tab {
  to: string;
  label: string;
  require: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: Tab[] = [
  { to: '/admin/roles', label: uiStatic('الأدوار والصلاحيات'), require: 'admin.roles:view', icon: ShieldCheck },
  { to: '/admin/exceptions', label: uiStatic('استثناءات المستخدمين'), require: 'admin.exceptions:view', icon: UserCog },
  { to: '/users', label: uiStatic('المستخدمون'), require: 'admin.users:view', icon: ListChecks },
  { to: '/admin/audit', label: uiStatic('سجل التدقيق'), require: 'admin.audit:view', icon: ScrollText },
];

/** Central system-administration hub: horizontal tabs, each hidden unless the user has View. */
export function AdminLayout() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const visible = TABS.filter((t) => can(t.require));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {visible.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <t.icon className="size-4" />
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
