import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteGuard } from '@/components/auth/route-guard';
import { Button } from '@/components/ui/button';
import { recordNavVisit } from '@/lib/nav-visit-tracker';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => localStorage.getItem('one80.sidebar.collapsed') === '1');
  const { t, isRtl, locale } = useLocale();
  const { pathname } = useLocation();
  const isCafePos = pathname === '/sales/new';
  const sidebarToggleLabel = desktopCollapsed
    ? (locale === 'ar' ? 'فتح القائمة الجانبية' : 'Expand sidebar')
    : (locale === 'ar' ? 'طي القائمة الجانبية' : 'Collapse sidebar');

  useEffect(() => {
    recordNavVisit(pathname);
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem('one80.sidebar.collapsed', desktopCollapsed ? '1' : '0');
  }, [desktopCollapsed]);

  return (
    <div className="app-shell-bg flex h-screen overflow-hidden">
      <div className={cn('relative hidden shrink-0 transition-[width] duration-300 lg:block', desktopCollapsed ? 'w-0' : 'w-[288px]')}>
        <div className="h-full overflow-hidden">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            'absolute top-1/2 z-40 size-7 -translate-y-1/2 rounded-full bg-background shadow-md',
            desktopCollapsed ? (isRtl ? '-left-8' : '-right-8') : '-end-3',
          )}
          onClick={() => setDesktopCollapsed((collapsed) => !collapsed)}
          aria-label={sidebarToggleLabel}
          title={sidebarToggleLabel}
        >
          {isRtl
            ? (desktopCollapsed ? <ChevronsLeft className="size-3.5" /> : <ChevronsRight className="size-3.5" />)
            : (desktopCollapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />)}
        </Button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className={cn('absolute inset-y-0 end-0 animate-slide-up shadow-2xl')}>
            <div className="relative h-full">
              <Button
                variant="ghost"
                size="icon"
                className="absolute -start-12 top-3 text-white hover:bg-white/10"
                onClick={() => setMobileOpen(false)}
                aria-label={t('common.close')}
              >
                <X />
              </Button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'relative z-40 shrink-0 overflow-hidden transition-[height] duration-300',
            isCafePos
              ? 'h-[5.75rem] lg:h-2 lg:hover:h-[5.75rem] lg:focus-within:h-[5.75rem]'
              : 'h-[5.75rem]',
          )}
          title={isCafePos ? (locale === 'ar' ? 'مرري المؤشر هنا لإظهار الهيدر' : 'Hover here to show the header') : undefined}
        >
          <Topbar onMenuClick={() => setMobileOpen(true)} />
        </div>
        <main className="app-main-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1800px] p-3 sm:p-4 lg:p-5 xl:p-6 animate-fade-in">
            <RouteGuard>
              <Outlet />
            </RouteGuard>
          </div>
        </main>
      </div>
    </div>
  );
}
