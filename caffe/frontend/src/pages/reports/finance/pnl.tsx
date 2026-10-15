import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function FinancePnlReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'finance-pnl', startDate, endDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<{
        totalRevenue?: number;
        totalExpenses?: number;
        netProfit?: number;
        grossProfit?: number;
        profitMargin?: number;
        byCategory?: Array<{ category: string; amount: number; type: string }>;
      }>('/finance/profit-loss', {
        params: { dateFrom: startDate, dateTo: endDate, ...(branchId ? { branchId: String(branchId) } : {}) },
      });
      return r;
    },
  });

  const revenue = data?.totalRevenue ?? 0;
  const expenses = data?.totalExpenses ?? 0;
  const profit = data?.netProfit ?? 0;
  const margin = data?.profitMargin ?? 0;

  const exportCsv = () =>
    downloadCsv(`pnl-${startDate}-${endDate}`, [
      [ui('البند'), ui('القيمة')],
      [ui('الإيرادات'), revenue],
      [ui('المصروفات'), expenses],
      [ui('صافي الربح'), profit],
      [ui('هامش الربح %'), margin],
    ]);

  return (
    <ReportShell
      title={ui('تقرير الأرباح والخسائر')}
      description={ui('نظرة إجمالية على الإيرادات، المصروفات وصافي الربح خلال الفترة')}
      filters={
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={<BranchFilter value={branch} onChange={setBranch} />}
        />
      }
      stats={
        <>
          <ClubStatCard label={ui('الإيرادات')} value={revenue} />
          <ClubStatCard label={ui('المصروفات')} value={expenses} />
          <ClubStatCard label={ui('صافي الربح')} value={profit} />
          <ClubStatCard label={ui('هامش الربح %')} value={toArabicDigits(Number(margin).toFixed(1))} />
        </>
      }
      onExport={exportCsv}
    >
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{ui('جاري التحميل...')}</p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">{ui('الإيرادات الإجمالية')}</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-600 nums">{toArabicDigits(revenue)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{ui('المصروفات الإجمالية')}</dt>
              <dd className="mt-1 text-2xl font-bold text-rose-600 nums">{toArabicDigits(expenses)}</dd>
            </div>
            <div className="sm:col-span-2 border-t pt-4">
              <dt className="text-sm text-muted-foreground">{ui('صافي الربح')}</dt>
              <dd className={`mt-1 text-3xl font-bold nums ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {toArabicDigits(profit)}
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui('هامش الربح')}: <span className="nums">{toArabicDigits(Number(margin).toFixed(1))}%</span>
              </p>
            </div>
          </dl>
        )}
      </div>
    </ReportShell>
  );
}
