import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/**
 * Treasury (cash on hand). Uses /club-dashboard/treasury which returns cash inflows/outflows and net balance.
 */
export function FinanceTreasuryReportPage() {
  const { ui } = useLocale();
  const [asOfDate, setAsOfDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'finance-treasury', asOfDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<{
        inflows?: number;
        outflows?: number;
        balance?: number;
        cashOnHand?: number;
        opening?: number;
      }>('/club-dashboard/treasury', {
        params: { date: asOfDate, ...(branchId ? { branchId: String(branchId) } : {}) },
      });
      return r;
    },
  });

  const inflows = data?.inflows ?? 0;
  const outflows = data?.outflows ?? 0;
  const balance = data?.balance ?? data?.cashOnHand ?? 0;

  const exportCsv = () =>
    downloadCsv(`treasury-${asOfDate}`, [
      [ui('البند'), ui('القيمة')],
      [ui('إيرادات نقدية'), inflows],
      [ui('مصروفات نقدية'), outflows],
      [ui('الرصيد'), balance],
    ]);

  return (
    <ReportShell
      title={ui('تقرير الخزينة')}
      description={ui('الرصيد النقدي بتاريخ معيّن، مع تفصيل التدفقات النقدية')}
      filters={
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{ui('حتى تاريخ')}</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="w-40" />
          </div>
          <BranchFilter value={branch} onChange={setBranch} />
        </div>
      }
      stats={
        <>
          <ClubStatCard label={ui('التدفقات الواردة')} value={inflows} />
          <ClubStatCard label={ui('التدفقات الصادرة')} value={outflows} />
          <ClubStatCard label={ui('الرصيد النقدي')} value={balance} />
        </>
      }
      onExport={exportCsv}
    >
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{ui('جاري التحميل...')}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              {ui('التاريخ')}: <span className="nums">{toArabicDigits(asOfDate)}</span>
            </p>
            <p>
              {ui('الرصيد المتاح')}: <span className="nums font-semibold">{toArabicDigits(balance)}</span>
            </p>
          </div>
        )}
      </div>
    </ReportShell>
  );
}

/**
 * Cash flow report — inflows and outflows across a period, month-by-month.
 */
export function FinanceCashFlowReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');

  const { data } = useQuery({
    queryKey: ['reports', 'finance-cash-flow', startDate, endDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<{
        monthlyTrend?: Array<{ month: string; revenue: number; expense: number; profit: number }>;
        totalRevenues?: number;
        totalExpenses?: number;
        netProfit?: number;
      }>('/finance/dashboard', {
        params: { dateFrom: startDate, dateTo: endDate, ...(branchId ? { branchId: String(branchId) } : {}) },
      });
      return r;
    },
  });

  const trend = data?.monthlyTrend ?? [];
  const totalIn = data?.totalRevenues ?? 0;
  const totalOut = data?.totalExpenses ?? 0;
  const net = data?.netProfit ?? 0;

  const exportCsv = () =>
    downloadCsv(`cash-flow-${startDate}-${endDate}`, [
      [ui('الشهر'), ui('واردة'), ui('صادرة'), ui('صافي')],
      ...trend.map((r) => [r.month, r.revenue, r.expense, r.profit]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير التدفقات النقدية')}
      description={ui('حركة النقد شهرياً خلال الفترة')}
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
          <ClubStatCard label={ui('إجمالي الوارد')} value={totalIn} />
          <ClubStatCard label={ui('إجمالي الصادر')} value={totalOut} />
          <ClubStatCard label={ui('الصافي')} value={net} />
        </>
      }
      onExport={exportCsv}
    >
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{ui('الشهر')}</th>
              <th className="p-3 text-start">{ui('واردة')}</th>
              <th className="p-3 text-start">{ui('صادرة')}</th>
              <th className="p-3 text-start">{ui('صافي')}</th>
            </tr>
          </thead>
          <tbody>
            {trend.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {ui('لا توجد بيانات')}
                </td>
              </tr>
            )}
            {trend.map((r) => (
              <tr key={r.month} className="border-t">
                <td className="p-3 nums">{toArabicDigits(r.month)}</td>
                <td className="p-3 nums text-emerald-600">{toArabicDigits(r.revenue)}</td>
                <td className="p-3 nums text-rose-600">{toArabicDigits(r.expense)}</td>
                <td className={`p-3 nums font-semibold ${r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {toArabicDigits(r.profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
