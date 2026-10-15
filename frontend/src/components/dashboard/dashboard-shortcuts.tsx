import { ArrowLeft, ArrowRight, Check, LayoutGrid, Plus, ReceiptText, Search, TrendingUp, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDashboardShortcuts } from '@/hooks/use-dashboard-shortcuts';
import { useNav, usePermission } from '@/hooks/use-permission';
import { dashboardShortcutPages, DEFAULT_DASHBOARD_SHORTCUTS } from '@/lib/dashboard-shortcuts';
import { navRouteIcon, translateNavRoute } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export function DashboardShortcuts({ variant = 'dashboard' }: { variant?: 'dashboard' | 'header' }) {
  const { user } = useAuth();
  // A keyed child prevents even one render of the previous account's selection.
  return user ? <AccountShortcuts key={user.sub} userId={user.sub} variant={variant} /> : null;
}

function AccountShortcuts({ userId, variant }: { userId: number; variant: 'dashboard' | 'header' }) {
  const { ui, t, dir, locale, isRtl } = useLocale();
  const { canNavRoute, isReady, hasError, retry } = usePermission();
  const nav = useNav();
  const shortcuts = useDashboardShortcuts(userId);
  const routes = shortcuts.data?.routes ?? [];
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const [search, setSearch] = useState('');
  const Forward = isRtl ? ArrowLeft : ArrowRight;
  const pages = useMemo(() => dashboardShortcutPages(nav.data ?? [], locale, canNavRoute), [nav.data, locale, canNavRoute]);
  const pageByRoute = new Map(pages.map((page) => [page.to, page]));
  const visible = isReady ? routes.filter((to) => canNavRoute(to)).flatMap((to) => {
    const page = pageByRoute.get(to);
    // Default labels are available while the catalog is loading. Other saved paths
    // must be in the returned catalog, including for super-admin accounts.
    if (page) return [page];
    return DEFAULT_DASHBOARD_SHORTCUTS.some((path) => path === to)
      ? [{ to, label: translateNavRoute(t, to), section: '' }] : [];
  }) : [];
  const needle = search.trim().toLocaleLowerCase(locale);
  const filtered = pages.filter((page) => `${page.label} ${page.section}`.toLocaleLowerCase(locale).includes(needle));
  const groups = [...new Set(filtered.map((page) => page.section))];

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const toggle = (to: string) => shortcuts.save(routes.includes(to) ? routes.filter((path) => path !== to) : [...routes, to]);
  const unavailable = !isReady || hasError || shortcuts.isLoading || shortcuts.isError;

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setSearch(''); }}>
    {variant === 'header' ? <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} permissionAction={null} variant="ghost" size="icon" title={ui('الوصول السريع')} aria-label={ui('الوصول السريع')} className="size-11 shrink-0 rounded-xl border border-primary/20 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15">
          <LayoutGrid className="size-[18px]" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" dir={dir} aria-label={ui('الوصول السريع')} onCloseAutoFocus={(event) => { if (open) event.preventDefault(); }} className="w-[min(340px,calc(100vw-24px))] rounded-xl p-3">
        <p className="mb-2 px-2 text-sm font-bold">{ui('الوصول السريع')}</p>
        <div className="max-h-[55vh] space-y-1 overflow-y-auto overscroll-contain">
          {visible.map((page) => {
            const Icon = navRouteIcon(page.to);
            return <Link key={page.to} to={page.to} onClick={() => setMenuOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1 leading-5">{page.label}</span><Forward className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></Link>;
          })}
          {shortcuts.isLoading && <p role="status" className="px-2 py-4 text-sm text-muted-foreground">{ui('جارٍ تحميل الاختصارات…')}</p>}
          {shortcuts.isError && <div role="alert" className="space-y-2 px-2 py-3 text-sm"><p>{ui('تعذر تحميل الاختصارات')}</p><Button permissionAction={null} variant="outline" onClick={() => void shortcuts.refetch()}>{ui('إعادة المحاولة')}</Button></div>}
          {!shortcuts.isLoading && !shortcuts.isError && !visible.length && <p className="px-2 py-4 text-sm text-muted-foreground">{ui('أضف صفحاتك اليومية للوصول إليها بسرعة')}</p>}
        </div>
        <Button permissionAction={null} variant="ghost" disabled={unavailable} className="mt-2 min-h-11 w-full justify-start gap-3 border-t pt-3 text-primary" onClick={() => { setMenuOpen(false); setOpen(true); }}><Plus className="size-4" aria-hidden="true" />{ui('تخصيص الاختصارات')}</Button>
      </PopoverContent>
    </Popover> : <section aria-labelledby="dashboard-shortcuts-title" className="space-y-3" dir={dir}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="dashboard-shortcuts-title" className="text-base font-bold">{ui('الوصول السريع')}</h2>
        <p className="text-xs text-muted-foreground">{ui('صفحاتك اليومية، بضغطة واحدة')}</p>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        {visible.map((page) => {
          const Icon = page.to === DEFAULT_DASHBOARD_SHORTCUTS[0] ? ReceiptText
            : page.to === DEFAULT_DASHBOARD_SHORTCUTS[1] ? WalletCards
            : page.to === DEFAULT_DASHBOARD_SHORTCUTS[2] ? TrendingUp : navRouteIcon(page.to);
          const featured = page.to === DEFAULT_DASHBOARD_SHORTCUTS[0];
          return (
            <div key={page.to} className={cn('group relative min-w-0 basis-full rounded-xl border transition-colors sm:basis-[calc(50%-3.25rem)] sm:grow lg:basis-[calc(33.333%-2.75rem)] lg:grow-0', featured ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'border-primary/20 bg-card hover:border-primary/60')}>
              <Link to={page.to} className="flex min-h-[76px] items-center gap-3 rounded-xl py-3 ps-4 pe-11 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors', featured ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground')} aria-hidden="true"><Icon className="size-5" /></span>
                <span className="min-w-0 flex-1 text-sm font-bold leading-6">{page.label}</span>
                <Forward className={cn('size-4 shrink-0', featured ? 'text-primary-foreground' : 'text-primary')} aria-hidden="true" />
              </Link>
              <button type="button" disabled={shortcuts.saving} onClick={() => toggle(page.to)} aria-label={`${ui('إزالة الاختصار')}: ${page.label}`} className={cn('absolute end-0 top-0 flex size-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100', featured ? 'text-primary-foreground hover:bg-primary-foreground/15' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}><X className="size-3.5" aria-hidden="true" /></button>
            </div>
          );
        })}
          <DialogTrigger asChild>
            <Button permissionAction={null} variant="outline" disabled={unavailable} className="h-auto min-h-[76px] w-full flex-col gap-1.5 rounded-xl border-dashed border-primary/40 bg-primary/[0.04] px-3 text-primary hover:border-primary hover:bg-primary/10 sm:w-24 sm:shrink-0">
              <Plus className="size-5" aria-hidden="true" /><span className="text-xs">{ui('إضافة اختصار')}</span>
            </Button>
          </DialogTrigger>
      </div>
      {shortcuts.isLoading && <p role="status" className="text-sm text-muted-foreground">{ui('جارٍ تحميل الاختصارات…')}</p>}
      {shortcuts.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span className="text-destructive">{ui('تعذر تحميل الاختصارات')}</span><Button permissionAction={null} variant="outline" onClick={() => void shortcuts.refetch()}>{ui('إعادة المحاولة')}</Button></div>}
      {hasError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><span className="text-destructive">{ui('تعذر تحميل صلاحيات الصفحات')}</span><Button permissionAction={null} variant="outline" onClick={retry}>{ui('إعادة المحاولة')}</Button></div>}
    </section>}
          <DialogContent size="md" dir={dir} className="gap-4" onCloseAutoFocus={variant === 'header' ? (event) => { event.preventDefault(); triggerRef.current?.focus(); } : undefined}>
            <DialogHeader>
              <DialogTitle>{ui('خصص الوصول السريع')}</DialogTitle>
              <DialogDescription>{ui('اختر من الصفحات المسموح بها لك. تُحفظ اختياراتك على حسابك وتظهر على كل أجهزتك.')}</DialogDescription>
            </DialogHeader>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
              <Input aria-label={ui('ابحث عن صفحة')} placeholder={ui('ابحث عن صفحة أو قسم…')} value={search} onChange={(event) => setSearch(event.target.value)} className="ps-10" />
            </div>
            <div className="max-h-[min(52vh,440px)] space-y-5 overflow-y-auto overscroll-contain pe-1">
              {nav.isLoading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{ui('جارٍ تحميل الصفحات…')}</p>}
              {nav.isError && <div role="alert" className="space-y-3 py-5 text-center"><p className="text-sm text-destructive">{ui('تعذر تحميل الصفحات المتاحة')}</p><Button permissionAction={null} variant="outline" onClick={() => void nav.refetch()}>{ui('إعادة المحاولة')}</Button></div>}
              {!nav.isLoading && !nav.isError && !filtered.length && <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد صفحات مطابقة للبحث')}</p>}
              {groups.map((section) => <div key={section} className="space-y-2">
                <h3 className="text-sm font-bold text-muted-foreground">{section}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filtered.filter((page) => page.section === section).map((page) => {
                    const Icon = navRouteIcon(page.to);
                    const selected = routes.includes(page.to);
                    return <button key={page.to} type="button" aria-pressed={selected} disabled={shortcuts.saving} onClick={() => toggle(page.to)} className={cn('flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', selected ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border hover:border-primary/30 hover:bg-muted')}>
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1 leading-5">{page.label}</span>{selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </button>;
                  })}
                </div>
              </div>)}
            </div>
            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p role="status" className="text-xs text-muted-foreground">{ui(shortcuts.saving ? 'جارٍ حفظ الاختصارات…' : 'التغييرات تُحفظ تلقائيًا')}</p>
              <Button permissionAction={null} onClick={() => setOpen(false)}>{ui('تم')}</Button>
            </div>
          </DialogContent>
    </Dialog>
  );
}
