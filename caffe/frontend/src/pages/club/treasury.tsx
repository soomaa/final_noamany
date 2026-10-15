import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';

const METHOD_LABELS: Record<string, string> = {
  cash: uiStatic('نقدي'),
  card: uiStatic('بطاقة'),
  visa: uiStatic('فيزا'),
  instapay: uiStatic('إنستا باي'),
  wallet: uiStatic('محفظة'),
  bank: uiStatic('حساب بنكي'),
  transfer: uiStatic('تحويل بنكي'),
  online: uiStatic('إلكتروني'),
};

const SOURCE_LABELS: Record<string, string> = {
  receipt: uiStatic('إيصال'),
  subscription: uiStatic('اشتراك'),
  locker: uiStatic('لوكر'),
  spa: uiStatic('سبا'),
  inbody: 'InBody',
};

type PeriodMode = 'today' | 'all' | 'range';

function monthStart(today = localToday()): string {
  return `${today.slice(0, 8)}01`;
}

function normalizeRange(from: string, to: string): { dateFrom: string; dateTo: string } {
  if (from && to && from > to) return { dateFrom: to, dateTo: from };
  return { dateFrom: from, dateTo: to };
}

export function ClubTreasuryPage() {
  const ct = useClubT();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('today');
  const [dateFrom, setDateFrom] = useState(() => monthStart());
  const [dateTo, setDateTo] = useState(() => localToday());

  const queryParams = useMemo(() => {
    if (periodMode === 'today') {
      const d = localToday();
      return { date: d, dateFrom: d, dateTo: d };
    }
    if (periodMode === 'all') return {};
    const { dateFrom: from, dateTo: to } = normalizeRange(dateFrom, dateTo);
    if (!from || !to) return { date: localToday(), dateFrom: localToday(), dateTo: localToday() };
    return { dateFrom: from, dateTo: to };
  }, [periodMode, dateFrom, dateTo]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['club-treasury', periodMode, queryParams.dateFrom ?? '', queryParams.dateTo ?? '', queryParams.date ?? ''],
    queryFn: async () => {
      const { data: r } = await api.get<{
        date: string | null;
        dateFrom: string | null;
        dateTo: string | null;
        periodMode: string;
        total: number;
        byMethod: Record<string, number>;
        summaryOnly: boolean;
        detailRangeLimitDays: number;
        entries: Array<{ source: string; customerName: string; amount: number; paymentMethod: string }>;
      }>('/club-dashboard/treasury', { params: queryParams });
      return r;
    },
  });

  const periodTabs: { id: PeriodMode; label: string }[] = [
    { id: 'today', label: ct('subscriptions.periodToday') },
    { id: 'all', label: ct('subscriptions.periodAll') },
    { id: 'range', label: ct('subscriptions.periodRange') },
  ];

  const periodCaption =
    periodMode === 'today'
      ? localToday()
      : periodMode === 'all'
        ? ct('subscriptions.periodAll')
        : `${dateFrom || '—'} → ${dateTo || '—'}`;

  return (
    <div className="space-y-6">
      <PageHeader title={ct('subscriptions.treasury')} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-2">
          <Label>{ct('subscriptions.period')}</Label>
          <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
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
            <div className="grid gap-2">
              <Label>{ct('common.dateFrom')}</Label>
              <Input
                type="date"
                className="nums w-[11.5rem]"
                dir="ltr"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ct('common.dateTo')}</Label>
              <Input
                type="date"
                className="nums w-[11.5rem]"
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
        {ct('subscriptions.period')}: {periodCaption}
        {isFetching ? ` · ${ct('common.loading')}` : ''}
      </p>

      {error && (
        <p className="text-sm text-destructive">{ct('common.noData')}</p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>}

      {data && (
        <>
          {data.summaryOnly && (
            <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
              تم حساب إجماليات الفترة كاملة بدون تحميل التفاصيل لحماية أداء النظام. التفاصيل متاحة
              لفترة لا تتجاوز{' '}
              <span className="nums font-semibold">
                {toArabicDigits(data.detailRangeLimitDays)}
              </span>{' '}
              يومًا.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <ClubStatCard label={ct('subscriptions.totalPaid')} value={data.total} />
            {Object.entries(data.byMethod).map(([method, amount]) => (
              <ClubStatCard
                key={method}
                label={METHOD_LABELS[method] ?? method}
                value={amount}
              />
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-start">{ct('common.customer')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.source')}</th>
                  <th className="p-2 text-start">{ct('common.amount')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.paymentMethod')}</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      {data.summaryOnly
                        ? 'التفاصيل غير محمّلة لهذه الفترة؛ الإجماليات بالأعلى تشمل الفترة كاملة'
                        : ct('common.noData')}
                    </td>
                  </tr>
                )}
                {data.entries.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{e.customerName}</td>
                    <td className="p-2">{SOURCE_LABELS[e.source] ?? e.source}</td>
                    <td className="p-2 nums">{toArabicDigits(e.amount)}</td>
                    <td className="p-2">{METHOD_LABELS[e.paymentMethod] ?? e.paymentMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
