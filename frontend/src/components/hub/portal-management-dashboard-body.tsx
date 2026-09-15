import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpLeft,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Dumbbell,
  Images,
  Mail,
  Package,
  PackageX,
  ShoppingBag,
  Users,
  Video,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatNum } from '@/lib/formatters';
import { PORTAL_ROUTES as PR } from '@/lib/portal-routes';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type PortalSummary = {
  attention: { unreadMessages: number; pendingApplications: number; pendingOrders: number; outOfStockProducts: number };
  orders: { pending: number; processing: number; completed: number; cancelled: number };
  jobs: { active: number; pending: number; accepted: number; rejected: number };
  store: { products: number; customers: number; completedRevenue: number };
  content: { sliders: number; photos: number; videos: number; heroVideos: number; branches: number; trainers: number; classes: number };
  messages: { unread: number; read: number };
  recentOrders: Array<{ id: number; customer: string | null; total: number; status: string; createdAt: string | null }>;
};

const ORDER_STYLES: Record<string, string> = {
  pending: 'bg-amber-500',
  processing: 'bg-sky-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  processing: 'border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  completed: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  cancelled: 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300',
};

export function PortalManagementDashboardBody() {
  const { t, locale } = useLocale();
  const { canRoute } = usePermission();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['portal-management', 'dashboard', 'summary'],
    queryFn: async () => (await api.get<PortalSummary>('/portal-management/summary')).data,
    staleTime: 30_000,
  });

  if (isError) return <ErrorState inline onRetry={() => void refetch()} />;

  const orderRows = data
    ? [
        { key: 'pending', value: data.orders.pending, icon: Clock3 },
        { key: 'processing', value: data.orders.processing, icon: CircleAlert },
        { key: 'completed', value: data.orders.completed, icon: CheckCircle2 },
        { key: 'cancelled', value: data.orders.cancelled, icon: XCircle },
      ]
    : [];
  const totalOrders = orderRows.reduce((sum, item) => sum + item.value, 0);

  const attention = data
    ? [
        { label: t('portalDashboard.unreadMessages'), value: data.attention.unreadMessages, to: PR.messages, icon: Mail },
        { label: t('portalDashboard.pendingApplications'), value: data.attention.pendingApplications, to: PR.jobApplications, icon: BriefcaseBusiness },
        { label: t('portalDashboard.pendingOrders'), value: data.attention.pendingOrders, to: PR.orders, icon: ShoppingBag },
        { label: t('portalDashboard.outOfStock'), value: data.attention.outOfStockProducts, to: PR.products, icon: PackageX },
      ].filter((item) => item.value > 0 && canRoute(item.to))
    : [];

  const content = data
    ? [
        { label: t('portalDashboard.sliders'), value: data.content.sliders, to: PR.sliders, icon: Images },
        { label: t('portalDashboard.photos'), value: data.content.photos, to: PR.photos, icon: Images },
        { label: t('portalDashboard.videos'), value: data.content.videos + data.content.heroVideos, to: PR.videos, icon: Video },
        { label: t('portalDashboard.branches'), value: data.content.branches, to: PR.branches, icon: Building2 },
        { label: t('portalDashboard.trainers'), value: data.content.trainers, to: PR.trainers, icon: Users },
        { label: t('portalDashboard.classes'), value: data.content.classes, to: PR.classes, icon: Dumbbell },
      ].filter((item) => canRoute(item.to))
    : [];

  return (
    <section className="space-y-6" aria-labelledby="portal-overview-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="portal-overview-title" className="text-xl font-bold">{t('portalDashboard.overview')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('portalDashboard.overviewDescription')}</p>
        </div>
        {!isLoading && data && (
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <SummaryPill icon={BriefcaseBusiness} label={t('portalDashboard.activeJobs')} value={data.jobs.active} />
            <SummaryPill icon={Package} label={t('portalDashboard.products')} value={data.store.products} />
            <SummaryPill icon={Users} label={t('portalDashboard.customers')} value={data.store.customers} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={isLoading} title={t('portalDashboard.unreadMessages')} value={data?.attention.unreadMessages ?? 0} icon={<Mail className="size-5" />} colorIndex={0} to={canRoute(PR.messages) ? PR.messages : undefined} />
        <StatCard loading={isLoading} title={t('portalDashboard.pendingApplications')} value={data?.attention.pendingApplications ?? 0} icon={<BriefcaseBusiness className="size-5" />} colorIndex={4} to={canRoute(PR.jobApplications) ? PR.jobApplications : undefined} />
        <StatCard loading={isLoading} title={t('portalDashboard.pendingOrders')} value={data?.attention.pendingOrders ?? 0} icon={<ShoppingBag className="size-5" />} colorIndex={2} to={canRoute(PR.orders) ? PR.orders : undefined} />
        <StatCard loading={isLoading} title={t('portalDashboard.completedRevenue')} value={formatMoney(data?.store.completedRevenue ?? 0, undefined, locale)} icon={<CheckCircle2 className="size-5" />} colorIndex={3} to={canRoute(PR.captainSalesReport) ? PR.captainSalesReport : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="border-border/70 shadow-sm xl:col-span-3">
          <CardHeader className="flex-row items-center justify-between border-b border-border/60 bg-muted/20">
            <CardTitle>{t('portalDashboard.ordersOverview')}</CardTitle>
            <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
              {t('portalDashboard.totalOrders')}: <span className="nums text-foreground">{formatNum(totalOrders, locale)}</span>
            </span>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />) : orderRows.map((item) => {
              const Icon = item.icon;
              const percentage = totalOrders ? Math.round((item.value / totalOrders) * 100) : 0;
              return (
                <div key={item.key} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 font-medium"><Icon className="size-4 text-muted-foreground" />{t(`portalDashboard.${item.key}`)}</span>
                    <span className="nums font-bold">{formatNum(item.value, locale)} <span className="text-xs font-normal text-muted-foreground">({formatNum(percentage, locale)}%)</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full transition-all', ORDER_STYLES[item.key])} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm xl:col-span-2">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle>{t('portalDashboard.needsAttention')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('portalDashboard.needsAttentionDescription')}</p>
          </CardHeader>
          <CardContent className="p-3">
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : attention.length ? (
              <div className="space-y-2">
                {attention.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.to} to={item.to} className="group flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-primary/20 hover:bg-primary/[0.06]">
                      <span className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><span className="truncate text-sm font-medium">{item.label}</span></span>
                      <span className="flex shrink-0 items-center gap-2"><span className="nums rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{formatNum(item.value, locale)}</span><ArrowUpLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5" /></span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center text-center"><span className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 className="size-6" /></span><p className="text-sm font-medium">{t('portalDashboard.allClear')}</p></div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20"><CardTitle>{t('portalDashboard.contentOverview')}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />) : content.map((item) => <ContentCard key={item.to} {...item} locale={locale} />)}
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex-row items-center justify-between border-b border-border/60 bg-muted/20">
          <CardTitle>{t('portalDashboard.recentOrders')}</CardTitle>
          {canRoute(PR.orders) && <Link to={PR.orders} className="text-xs font-semibold text-primary hover:underline">{t('portalDashboard.viewAll')}</Link>}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : !data?.recentOrders.length ? <p className="p-10 text-center text-sm text-muted-foreground">{t('portalDashboard.noOrders')}</p> : (
            <table className="w-full min-w-[680px] text-sm">
              <thead><tr className="border-b bg-muted/20 text-muted-foreground"><th className="p-3 text-start">{t('portalDashboard.orderNumber')}</th><th className="p-3 text-start">{t('portalDashboard.customer')}</th><th className="p-3 text-start">{t('portalDashboard.total')}</th><th className="p-3 text-start">{t('portalDashboard.status')}</th><th className="p-3 text-start">{t('portalDashboard.date')}</th></tr></thead>
              <tbody>{data.recentOrders.map((order) => <tr key={order.id} className="border-b last:border-0 hover:bg-muted/20"><td className="p-3 font-semibold nums">#{formatNum(order.id, locale)}</td><td className="p-3">{order.customer || '—'}</td><td className="p-3 nums font-medium">{formatMoney(order.total, undefined, locale)}</td><td className="p-3"><span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', STATUS_BADGES[order.status] ?? 'bg-muted text-muted-foreground')}>{t(`portalDashboard.${order.status}`)}</span></td><td className="p-3 nums text-muted-foreground">{formatDate(order.createdAt, 'yyyy/MM/dd', locale)}</td></tr>)}</tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function SummaryPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 shadow-sm"><Icon className="size-3.5 text-primary" />{label}<strong className="nums text-foreground">{value}</strong></span>;
}

function ContentCard({ icon: Icon, label, value, to, locale }: { icon: LucideIcon; label: string; value: number; to: string; locale: 'ar' | 'en' }) {
  return <Link to={to} className="group rounded-xl border border-border/70 bg-muted/15 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.05] hover:shadow-sm"><div className="flex items-start justify-between gap-2"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-4" /></span><span className="nums text-2xl font-bold">{formatNum(value, locale)}</span></div><p className="mt-3 truncate text-sm font-medium text-muted-foreground group-hover:text-foreground">{label}</p></Link>;
}
