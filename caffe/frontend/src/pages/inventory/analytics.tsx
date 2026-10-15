import { useQuery } from '@tanstack/react-query';
import { BarChart3, Package, TrendingDown } from 'lucide-react';
import { StatCard } from '@/components/common/stat-card';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import type { InventoryDashboardSummary } from '@/types/inventory';
import { useBranches } from '@/hooks/use-branches';
import { useListQuery } from '@/lib/use-list-query';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';

export function InventoryAnalyticsPage() {
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

  const movementEntries = Object.entries(data?.movementsByType ?? {});

  return (
    <InventoryPageShell title={ui('البيانات والتحليل الذكي')} description={ui('مؤشرات الأداء وتحليل حركة المخزون')}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          title={ui('الأصناف')}
          value={isLoading ? '…' : toArabicDigits(data?.totalProducts ?? 0)}
          icon={<Package className="h-5 w-5" />}
          colorIndex={0}
        />
        <StatCard
          title={ui('قيمة المخزون')}
          value={isLoading ? '…' : toArabicDigits(Math.round(data?.totalStockValue ?? 0))}
          icon={<BarChart3 className="h-5 w-5" />}
          colorIndex={1}
        />
        <StatCard
          title={ui('تنبيهات المخزون')}
          value={isLoading ? '…' : toArabicDigits(data?.lowStockCount ?? 0)}
          icon={<TrendingDown className="h-5 w-5" />}
          colorIndex={2}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 font-semibold">{ui('توزيع الحركات حسب النوع')}</h3>
          {movementEntries.length ? (
            <div className="space-y-3">
              {movementEntries.map(([type, count]) => {
                const max = Math.max(...movementEntries.map(([, c]) => c), 1);
                const pct = Math.round((count / max) * 100);
                return (
                  <div key={type}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{type}</span>
                      <span className="nums text-muted-foreground">{toArabicDigits(count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد حركات مسجّلة بعد')}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 font-semibold">{ui('أعلى الأصناف قيمةً')}</h3>
          <ul className="space-y-2 text-sm">
            {(data?.topItems ?? []).map((item) => (
              <li key={`${item.productId}-${item.warehouseId}`} className="flex justify-between border-b pb-2">
                <span>{item.productName ?? '—'}{item.productSize ? ` — ${item.productSize}` : ''}</span>
                <span className="nums font-medium">{toArabicDigits(Math.round(item.stockValue))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </InventoryPageShell>
  );
}
