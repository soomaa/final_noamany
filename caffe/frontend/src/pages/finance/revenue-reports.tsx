import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { RevenueReportData } from '@/types/finance';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

function yearStart() {
  return localDateStr(new Date(new Date().getFullYear(), 0, 1));
}

export function FinanceRevenueReportsPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'revenue-reports', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<RevenueReportData>('/finance/revenue-reports', {
        params: {
          startDate,
          endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  return (
    <FinancePageShell title={ui('تقارير الإيرادات')} description={ui('تحليل الإيرادات حسب المصدر والفترة')}>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('من تاريخ')}</Label>
          <Input className="nums" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('إلى تاريخ')}</Label>
          <Input className="nums" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('الفرع')}</Label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="all">{ui('كل الفروع')}</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="brand" onClick={() => void refetch()}>
          {ui('بحث')}
        </Button>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ui('إجمالي الإيرادات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalAmount ?? 0).toFixed(2))}
          colorIndex={2}
          loading={isLoading}
        />
        <StatCard
          title={ui('عدد الإيرادات')}
          value={isLoading ? '…' : toArabicDigits(data?.totalRevenues ?? 0)}
          colorIndex={0}
          loading={isLoading}
        />
        <StatCard
          title={ui('الضرائب')}
          value={isLoading ? '…' : toArabicDigits((data?.totalTax ?? 0).toFixed(2))}
          colorIndex={1}
          loading={isLoading}
        />
        <StatCard
          title={ui('الخصومات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalDiscount ?? 0).toFixed(2))}
          colorIndex={4}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('الإيرادات حسب المصدر')}</h3>
          {(data?.revenuesBySource ?? []).length > 0 ? (
            <div className="space-y-2">
              {(data?.revenuesBySource ?? []).map((src) => (
                <div key={src.source} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                  <span>{src.source}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{toArabicDigits(src.count)}</span>
                    <span className="nums font-bold text-green-600">{toArabicDigits(src.total.toFixed(2))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('الإيرادات الشهرية')}</h3>
          {(data?.monthlyRevenues ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.monthlyRevenues ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => toArabicDigits(v)} />
                <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
                <Bar dataKey="total" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>
      </div>

      {(data?.topCustomers ?? []).length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 flex items-center gap-2 font-semibold">
            <Users className="h-5 w-5" />
            {ui('أفضل العملاء')}
          </h3>
          <div className="space-y-2">
            {(data?.topCustomers ?? []).map((c) => (
              <div key={c.customerName} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                <span>{c.customerName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{toArabicDigits(c.count)}</span>
                  <span className="nums font-bold">{toArabicDigits(c.total.toFixed(2))}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </FinancePageShell>
  );
}
