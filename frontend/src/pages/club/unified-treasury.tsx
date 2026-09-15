import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, getAccessToken } from '@/lib/api';
import { downloadFromApi, downloadMultiSheetExcel, printElement } from '@/lib/export';
import { localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface TreasuryData {
  date: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  periodMode: string;
  grandTotal: number;
  grandCount: number;
  totalExpenses: number;
  netCash: number;
  byMethod: Record<string, { count: number; total: number }>;
  bySource: Record<string, { count: number; total: number }>;
  summaryOnly: boolean;
  detailRangeLimitDays: number;
  entries: Array<{
    source: string;
    sourceLabel: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    reference?: string;
  }>;
}

const METHOD_LABELS: Record<string, string> = {
  cash: uiStatic('نقدي'), card: uiStatic('بطاقة'), visa: uiStatic('فيزا'), instapay: uiStatic('إنستا باي'), wallet: uiStatic('محفظة'), bank: uiStatic('حساب بنكي'), transfer: uiStatic('تحويل بنكي'), online: uiStatic('إلكتروني'), other: uiStatic('أخرى'),
};

type PeriodMode = 'today' | 'all' | 'range';

function monthStart(today = localToday()): string {
  return `${today.slice(0, 8)}01`;
}

function normalizeRange(from: string, to: string): { dateFrom: string; dateTo: string } {
  if (from && to && from > to) return { dateFrom: to, dateTo: from };
  return { dateFrom: from, dateTo: to };
}

export function UnifiedTreasuryPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('today');
  const [dateFrom, setDateFrom] = useState(() => monthStart());
  const [dateTo, setDateTo] = useState(() => localToday());
  const printRef = useRef<HTMLDivElement>(null);

  const queryParams = useMemo(() => {
    const base: Record<string, string> = branchId ? { branchId } : {};
    if (periodMode === 'today') {
      const d = localToday();
      return { ...base, date: d, dateFrom: d, dateTo: d };
    }
    if (periodMode === 'all') return base;
    const { dateFrom: from, dateTo: to } = normalizeRange(dateFrom, dateTo);
    if (!from || !to) {
      const d = localToday();
      return { ...base, date: d, dateFrom: d, dateTo: d };
    }
    return { ...base, dateFrom: from, dateTo: to };
  }, [periodMode, dateFrom, dateTo, branchId]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'treasury',
      'daily',
      periodMode,
      queryParams.dateFrom ?? '',
      queryParams.dateTo ?? '',
      queryParams.date ?? '',
      queryParams.branchId ?? '',
    ],
    queryFn: async () => {
      const { data: r } = await api.get<TreasuryData>('/treasury/daily', {
        params: queryParams,
      });
      return r;
    },
  });

  const exportStamp =
    periodMode === 'all'
      ? 'all'
      : periodMode === 'today'
        ? localToday()
        : `${dateFrom || 'from'}_${dateTo || 'to'}`;

  const exportExcel = async () => {
    if (!data) return;
    await downloadMultiSheetExcel(
      [
        {
          name: ui('التفاصيل'),
          columns: [
            { key: 'sourceLabel', header: ui('المصدر') },
            { key: 'customerName', header: ui('العميل') },
            { key: 'amount', header: ui('المبلغ') },
            { key: 'paymentMethod', header: ui('طريقة الدفع') },
          ],
          rows: data.entries.map((e) => ({
            ...e,
            paymentMethod: METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod,
          })),
        },
        {
          name: ui('طرق التحصيل'),
          columns: [
            { key: 'method', header: ui('الطريقة') },
            { key: 'count', header: ui('العدد') },
            { key: 'total', header: ui('الإجمالي') },
          ],
          rows: Object.entries(data.byMethod).map(([method, v]) => ({
            method: METHOD_LABELS[method] ?? method, count: v.count, total: v.total,
          })),
        },
        {
          name: ui('مصادر الإيراد'),
          columns: [
            { key: 'source', header: ui('المصدر') },
            { key: 'count', header: ui('العدد') },
            { key: 'total', header: ui('الإجمالي') },
          ],
          rows: Object.entries(data.bySource).map(([source, v]) => ({ source, count: v.count, total: v.total })),
        },
      ],
      `treasury_${exportStamp}.xlsx`,
    );
  };

  const exportServer = async () => {
    const qs = new URLSearchParams();
    if (periodMode === 'today') {
      const d = localToday();
      qs.set('dateFrom', d);
      qs.set('dateTo', d);
    } else if (periodMode === 'range') {
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
    }
    if (branchId) qs.set('branchId', branchId);
    qs.set('format', 'xlsx');
    await downloadFromApi(
      `/api/treasury/daily/export?${qs.toString()}`,
      `treasury_${exportStamp}.xlsx`,
      getAccessToken() ?? undefined,
    );
  };

  const periodTabs: { id: PeriodMode; label: string }[] = [
    { id: 'today', label: ui('إيرادات اليوم') },
    { id: 'all', label: ui('كل الإيرادات') },
    { id: 'range', label: ui('من فترة لفترة') },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{ui('الخزينة الموحدة')}</h1>
          <p className="text-sm text-muted-foreground">{ui('تجميع كل مصادر الإيراد — اشتراكات، POS، سبا، InBody، إيرادات')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={!data}>
            <Download className="ms-1 h-4 w-4" />
            {ui('Excel')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportServer()} disabled={!data}>
            <Download className="ms-1 h-4 w-4" />
            {ui('تصدير من الخادم')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current, ui('الخزينة'))} disabled={!data}>
            <Printer className="ms-1 h-4 w-4" />
            {ui('طباعة')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">{ui('الفرع')}</Label>
          <select
            className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">{ui('كل الفروع')}</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{ui('الفترة')}</Label>
          <div className="mt-1 flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
            {periodTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPeriodMode(tab.id);
                  if (tab.id === 'today') {
                    const d = localToday();
                    setDateFrom(d);
                    setDateTo(d);
                  }
                  if (tab.id === 'range') {
                    setDateFrom(monthStart());
                    setDateTo(localToday());
                  }
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  periodMode === tab.id
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {periodMode === 'range' && (
          <>
            <div>
              <Label className="text-xs">{ui('من تاريخ')}</Label>
              <Input
                className="mt-1 nums w-[11.5rem]"
                type="date"
                dir="ltr"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{ui('إلى تاريخ')}</Label>
              <Input
                className="mt-1 nums w-[11.5rem]"
                type="date"
                dir="ltr"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground nums">
        {ui('الفترة')}:{' '}
        {periodMode === 'today'
          ? localToday()
          : periodMode === 'all'
            ? ui('كل الإيرادات')
            : `${dateFrom || '—'} → ${dateTo || '—'}`}
        {isFetching ? ` · ${ui('جاري التحميل…')}` : ''}
      </p>

      {data?.summaryOnly && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
          {ui('تم حساب إجماليات الفترة كاملة بدون تحميل التفاصيل لحماية أداء النظام. التفاصيل متاحة عند اختيار فترة لا تتجاوز')}{' '}
          <span className="nums font-semibold">{toArabicDigits(data.detailRangeLimitDays)}</span>{' '}
          {ui('يومًا')}.
        </p>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">{ui('جاري التحميل…')}</p>
      ) : data ? (
        <>
          <div ref={printRef} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{ui('إجمالي الإيراد')}</p><p className="nums text-2xl font-bold">{toArabicDigits(data.grandTotal.toFixed(2))}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{ui('عدد العمليات')}</p><p className="nums text-2xl font-bold">{toArabicDigits(data.grandCount)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{ui('المصروفات')}</p><p className="nums text-2xl font-bold">{toArabicDigits(data.totalExpenses.toFixed(2))}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{ui('صافي النقد')}</p><p className="nums text-2xl font-bold">{toArabicDigits(data.netCash.toFixed(2))}</p></CardContent></Card>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ui('المصدر')}</th>
                    <th className="p-2 text-start">{ui('العميل')}</th>
                    <th className="p-2 text-start">{ui('المبلغ')}</th>
                    <th className="p-2 text-start">{ui('طريقة الدفع')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        {data.summaryOnly
                          ? ui('التفاصيل غير محمّلة لهذه الفترة؛ الإجماليات بالأعلى تشمل الفترة كاملة')
                          : ui('لا توجد بيانات')}
                      </td>
                    </tr>
                  )}
                  {data.entries.map((e, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{e.sourceLabel}</td>
                      <td className="p-2">{e.customerName}</td>
                      <td className="p-2 nums">{toArabicDigits(e.amount.toFixed(2))}</td>
                      <td className="p-2">{METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
