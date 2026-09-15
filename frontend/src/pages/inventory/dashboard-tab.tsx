import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BellRing,
  CheckCircle2,
  CircleOff,
  Package,
  ShoppingCart,
  TrendingDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '@/components/common/stat-card';
import { ChartCard } from '@/components/common/chart-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cafeUnitLabel } from '@/lib/cafe-units';
import { toArabicDigits } from '@/lib/utils';
import type { InventoryDashboardSummary } from '@/types/inventory';
import { useBranches } from '@/hooks/use-branches';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';

export function DashboardTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery({ filters: { branchId: 'all' } });
  const branchId = params.filters.branchId ?? 'all';
  const { data: branches } = useBranches();

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-dashboard', 'summary', branchId],
    queryFn: async () => {
      const { data: s } = await api.get<InventoryDashboardSummary>('/inventory-dashboard/summary', {
        params: branchId !== 'all' ? { branchId } : {},
      });
      return s;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">{ui('الفرع')}</label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={branchId}
          onChange={(e) => setParams({ filters: { branchId: e.target.value } })}
        >
          <option value="all">{ui('كل الفروع')}</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={ui('إجمالي الأصناف')}
          value={isLoading ? '…' : toArabicDigits(data?.totalProducts ?? 0)}
          icon={<Package className="h-5 w-5" />}
          colorIndex={0}
        />
        <StatCard
          title={ui('قيمة المخزون')}
          value={isLoading ? '…' : toArabicDigits(Math.round(data?.totalStockValue ?? 0))}
          icon={<TrendingDown className="h-5 w-5" />}
          colorIndex={1}
        />
        <StatCard
          title={ui('منخفض المخزون')}
          value={isLoading ? '…' : toArabicDigits(data?.lowStockCount ?? 0)}
          icon={<TrendingDown className="h-5 w-5" />}
          colorIndex={2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={ui('أصناف بها رصيد')} value={isLoading ? '…' : toArabicDigits(data?.stockedProductCount ?? 0)} icon={<Package className="h-5 w-5" />} colorIndex={4} />
        <StatCard title={ui('حركات وارد اليوم')} value={isLoading ? '…' : toArabicDigits(data?.todayIncomingMovements ?? 0)} icon={<ArrowDownToLine className="h-5 w-5" />} colorIndex={5} />
        <StatCard title={ui('حركات منصرف اليوم')} value={isLoading ? '…' : toArabicDigits(data?.todayOutgoingMovements ?? 0)} icon={<ArrowUpFromLine className="h-5 w-5" />} colorIndex={6} />
        <StatCard title={ui('أرصدة صفرية')} value={isLoading ? '…' : toArabicDigits(data?.zeroStockCount ?? 0)} icon={<CircleOff className="h-5 w-5" />} colorIndex={7} />
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl border bg-muted/40" aria-label={ui('جاري تحميل تنبيهات الشراء')} />
      ) : data?.lowStockItems?.length ? (
        <section
          aria-labelledby="purchase-alerts-title"
          className="overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-50 via-card to-orange-50 shadow-sm dark:border-amber-500/30 dark:from-amber-950/25 dark:via-card dark:to-orange-950/20"
        >
          <div className="flex flex-col gap-4 border-b border-amber-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/20">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/25">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="purchase-alerts-title" className="font-bold text-amber-950 dark:text-amber-100">
                    {ui('تنبيهات الشراء')}
                  </h2>
                  <Badge variant="warning">
                    {toArabicDigits(data.lowStockItems.length)} {ui('تنبيه شراء')}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-amber-900/70 dark:text-amber-100/70">
                  {ui('هذه الأصناف وصلت إلى حد التنبيه وتحتاج إلى مراجعة الشراء.')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/club/cafe/raw-materials">{ui('مراجعة الخامات')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/club/cafe/purchases">
                  <ShoppingCart className="h-4 w-4" />
                  {ui('فتح المشتريات')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid max-h-80 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-3">
            {data.lowStockItems.map((item) => {
              const isOutOfStock = item.currentStock <= 0;
              return (
                <article
                  key={item.productId}
                  className={`rounded-xl border bg-card/90 p-4 shadow-sm ${
                    isOutOfStock
                      ? 'border-red-300 dark:border-red-500/30'
                      : 'border-amber-200 dark:border-amber-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">{item.name}</h3>
                        {item.size ? <Badge variant="outline" className="shrink-0 nums">{item.size}</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground nums">{item.productCode}</p>
                    </div>
                    <Badge variant={isOutOfStock ? 'destructive' : 'warning'}>
                      {isOutOfStock ? ui('نفد المخزون') : ui('مخزون منخفض')}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-muted/55 p-2.5">
                      <dt className="text-xs text-muted-foreground">{ui('الرصيد الحالي')}</dt>
                      <dd className={`mt-1 font-bold nums ${isOutOfStock ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
                        {toArabicDigits(item.currentStock)} {cafeUnitLabel(item.unit)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-muted/55 p-2.5">
                      <dt className="text-xs text-muted-foreground">{ui('حد التنبيه')}</dt>
                      <dd className="mt-1 font-bold nums">
                        {toArabicDigits(item.alertQuantity)} {cafeUnitLabel(item.unit)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 truncate text-xs text-muted-foreground">
                    {ui('المورد')}: <span className="font-medium text-foreground">{item.supplierName ?? ui('غير محدد')}</span>
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-950/20 dark:text-emerald-100">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">{ui('المخزون آمن')}</h2>
            <p className="text-sm opacity-75">{ui('لا توجد تنبيهات شراء حالياً.')}</p>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={ui('حركات المخزون')}
          icon={ArrowLeftRight}
          loading={isLoading}
          isEmpty={!isLoading && !(data?.movementsByType && Object.keys(data.movementsByType).length > 0)}
          emptyText={ui('لا توجد بيانات بعد')}
          height={260}
        >
          <BarChart data={Object.entries(data?.movementsByType ?? {}).map(([name, value]) => ({ name, value }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => toArabicDigits(v)} />
            <Tooltip formatter={(v: number) => toArabicDigits(v)} />
            <Bar dataKey="value" fill="#1E6BA8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard
          title={ui('أعلى الأصناف بالمخزون')}
          icon={Package}
          isEmpty={!isLoading && !(data?.topItems?.length)}
          emptyText={ui('لا توجد بيانات بعد')}
          height={260}
        >
          <BarChart
            data={(data?.topItems ?? []).slice(0, 6).map((item) => ({
              name: `${item.productName ?? '—'}${item.productSize ? ` ${item.productSize}` : ''}`.slice(0, 18),
              stock: item.currentStock,
            }))}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => toArabicDigits(v)} />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: number) => toArabicDigits(v)} />
            <Bar dataKey="stock" fill="#16a34a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <ArrowLeftRight className="h-4 w-4" />
            {ui('إجمالي الحركات')}
          </h3>
          <p className="text-2xl font-bold nums">{toArabicDigits(data?.movementCount ?? 0)}</p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 font-semibold">{ui('ملخص سريع')}</h3>
          <ul className="space-y-2 text-sm">
            {(data?.topItems ?? []).slice(0, 4).map((item) => (
              <li key={`${item.productId}-${item.warehouseId}`} className="flex justify-between border-b pb-2">
                <span>{item.productName ?? '—'}{item.productSize ? ` — ${item.productSize}` : ''}</span>
                <span className="nums text-muted-foreground">{toArabicDigits(item.currentStock)}</span>
              </li>
            ))}
            {!isLoading && !data?.topItems?.length && (
              <li className="text-muted-foreground">{ui('لا توجد بيانات بعد')}</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
