import { Bell, Circle, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { matchPath, NavLink, Outlet } from 'react-router-dom';
import { useNav, usePermission, type NavApiNode } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { PORTABLE_ROUTES } from './routes';

function flattenPortableNav(nodes: NavApiNode[]): NavApiNode[] {
  return nodes.flatMap((node) => [
    ...(node.route && PORTABLE_ROUTES.some(({ path }) => matchPath({ path, end: true }, node.route!)) ? [node] : []),
    ...flattenPortableNav(node.children ?? []),
  ]);
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data, isLoading, isError } = useNav();
  const { canNavRoute, isReady } = usePermission();
  const { locale, ui } = useLocale();
  const items = isReady ? flattenPortableNav(data ?? []).filter((node) => node.route && canNavRoute(node.route)) : [];
  return <nav aria-label={ui('التنقل الرئيسي')} className="space-y-1 overflow-y-auto p-3">
    {isLoading || !isReady ? <p className="px-3 py-2 text-sm text-muted-foreground">{ui('جارٍ تحميل القائمة…')}</p> : null}
    {isError ? <p className="px-3 py-2 text-sm text-destructive">{ui('تعذر تحميل القائمة')}</p> : null}
    {items.map((node) => <NavLink key={node.key} to={node.route!} onClick={onNavigate} className={({ isActive }) => cn(
      'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )}><Circle aria-hidden="true" className="size-2 fill-current" /><span>{locale === 'en' ? node.nameEn ?? node.nameAr : node.nameAr}</span></NavLink>)}
  </nav>;
}

export function PortableShell(): ReactNode {
  const [open, setOpen] = useState(false);
  const { dir, ui } = useLocale();
  return <div className="min-h-screen bg-background text-foreground" dir={dir}>
    <a href="#portable-main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2">{ui('انتقل إلى المحتوى')}</a>
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
      <button type="button" aria-label={ui('فتح القائمة')} aria-expanded={open} onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-xl hover:bg-muted lg:hidden"><Menu className="size-5" /></button>
      <div className="min-w-0 flex-1"><p className="truncate text-base font-bold">{ui('إدارة الموارد البشرية')}</p><p className="truncate text-xs text-muted-foreground">{ui('مساحة عمل محمولة')}</p></div>
      <NavLink to="/notifications" aria-label={ui('الإشعارات')} className="grid size-11 place-items-center rounded-xl hover:bg-muted"><Bell className="size-5" /></NavLink>
      <NavLink to="/profile" className="rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted">{ui('حسابي')}</NavLink>
    </header>
    <aside className="fixed inset-y-16 start-0 hidden w-64 border-e bg-card lg:block"><SideNav /></aside>
    {open && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label={ui('إغلاق القائمة')} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} /><aside className="absolute inset-y-0 start-0 w-[min(82vw,20rem)] bg-card shadow-2xl"><div className="flex h-16 items-center justify-between border-b px-4"><span className="font-bold">{ui('الموارد البشرية')}</span><button aria-label={ui('إغلاق القائمة')} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-xl hover:bg-muted"><X className="size-5" /></button></div><SideNav onNavigate={() => setOpen(false)} /></aside></div>}
    <main id="portable-main" className="min-w-0 p-4 lg:ms-64 lg:p-6"><Outlet /></main>
  </div>;
}
