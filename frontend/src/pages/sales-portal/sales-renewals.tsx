import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, MessageCircle, PhoneCall, Search } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { formatDate, formatMoney, formatNum } from '@/lib/formatters';
import { toDialLink, toWhatsAppLink } from '@/lib/contact-links';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { sortSalesRenewalRows } from './sales-workspace-model';
import type { SalesLead } from './index';
import { uiStatic } from '@/lib/ui-static';

type RenewalWindow = 'all' | 'renewed' | 'expired' | '5' | '7' | '14';
type RenewalRow = {
  memberId: number;
  memberCode: string;
  memberName: string;
  phone: string | null;
  subscriptionId: number;
  paidAmount: number;
  subscriptionType: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  leadId: number | null;
  lastContactedAt: string | null;
};
type RenewalsResponse = {
  data: RenewalRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { expired: number; dueSoon: number; total: number };
};

export function SalesRenewals({ active, onSelect }: { active: boolean; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  const [window, setWindow] = useState<RenewalWindow>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openingMemberId, setOpeningMemberId] = useState<number | null>(null);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => globalThis.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [window, debouncedSearch]);

  const query = useQuery({
    queryKey: ['sales-renewals', window, debouncedSearch, page],
    enabled: active,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () =>
      (await api.get<RenewalsResponse>('/club-members/sales-renewals', {
        params: { window, search: debouncedSearch || undefined, page, pageSize: 25 },
      })).data,
    placeholderData: (previous) => previous,
  });

  const openFollowUp = async (row: RenewalRow) => {
    setOpeningMemberId(row.memberId);
    try {
      const lead = (await api.post<SalesLead>(`/club-leads/renewal/${row.memberId}/ensure`)).data;
      onSelect(lead);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setOpeningMemberId(null);
    }
  };

  const filters: Array<{ value: RenewalWindow; label: string; count?: number }> = [
    { value: 'all', label: uiStatic('بحاجة للمتابعة'), count: query.data?.summary.total },
    { value: 'renewed', label: uiStatic('تم التجديد') },
    { value: 'expired', label: uiStatic('منتهي'), count: query.data?.summary.expired },
    { value: '5', label: uiStatic('خلال 5 أيام') },
    { value: '7', label: uiStatic('خلال 7 أيام'), count: query.data?.summary.dueSoon },
    { value: '14', label: uiStatic('خلال 14 يومًا') },
  ];
  const rows = sortSalesRenewalRows(query.data?.data ?? []);
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)));

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="sales-renewals-title">
      <div className="border-b p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="sales-renewals-title" className="font-bold">{ui('متابعة تجديد الاشتراكات')}</h2>
            <p className="mt-1 max-w-[68ch] text-xs leading-5 text-muted-foreground">{ui('تعرض أحدث اشتراك فعلي ومبلغه المدفوع لعملائك فقط، مرتبة حسب أولوية الانتهاء.')}</p>
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-10" placeholder={ui('بحث بالاسم أو الموبايل أو الكود…')} aria-label={ui('بحث في تجديدات العملاء')} />
          </div>
        </div>
        <div className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label={ui('فلترة حسب موعد الانتهاء')}>
          {filters.map((filter) => (
            <button key={filter.value} type="button" aria-pressed={window === filter.value} onClick={() => setWindow(filter.value)} className={cn('flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', window === filter.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground')}>
              {ui(filter.label)}
              {filter.count != null ? <span className="nums rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">{formatNum(filter.count)}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3 p-5">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-lg" />)}</div>
      ) : query.isError ? (
        <ErrorState inline onRetry={() => void query.refetch()} />
      ) : !rows.length ? (
        <EmptyState title={ui('لا توجد اشتراكات ضمن هذا الفلتر')} description={ui('غيّر مدة الانتهاء أو البحث لعرض عملاء آخرين.')} />
      ) : (
        <div className="divide-y">
          {rows.map((row, index) => (
            <article key={row.memberId} className="grid gap-4 p-4 sm:px-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">#{formatNum((page - 1) * (query.data?.pageSize ?? 25) + index + 1)} · {row.memberCode}</p>
                <h3 className="mt-1 break-words font-bold">{row.memberName}</h3>
                <p className="nums mt-1 text-xs text-muted-foreground" dir="ltr">{row.phone || ui('بدون رقم مسجل')}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="min-w-0"><dt className="text-xs text-muted-foreground">{ui('الاشتراك')}</dt><dd className="truncate font-semibold">{row.subscriptionType}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{ui('المدفوع الفعلي')}</dt><dd className="nums font-semibold">{formatMoney(row.paidAmount)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{ui('تاريخ الانتهاء')}</dt><dd className="nums font-semibold">{formatDate(row.endDate)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{ui('الأولوية')}</dt><dd className={cn('font-semibold', row.daysRemaining < 0 ? 'text-destructive' : 'text-foreground')}>{row.daysRemaining < 0 ? `${ui('منتهي منذ')} ${formatNum(Math.abs(row.daysRemaining))} ${ui('يوم')}` : `${ui('متبقي')} ${formatNum(row.daysRemaining)} ${ui('يوم')}`}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {toDialLink(row.phone) ? <Button asChild size="icon" variant="outline"><a href={toDialLink(row.phone)!} aria-label={ui('اتصال بالعضو')}><PhoneCall className="size-4" /></a></Button> : null}
                {toWhatsAppLink(row.phone, ui('مرحبًا، اشتراكك في ONE80 قرب ينتهي')) ? <Button asChild size="icon" variant="outline"><a href={toWhatsAppLink(row.phone, ui('مرحبًا، اشتراكك في ONE80 قرب ينتهي'))!} target="_blank" rel="noreferrer" aria-label={ui('فتح واتساب')}><MessageCircle className="size-4" /></a></Button> : null}
                <Button variant="brand" disabled={openingMemberId != null} onClick={() => void openFollowUp(row)}>
                  <CalendarClock className="size-4" />{ui(openingMemberId === row.memberId ? uiStatic('جارٍ فتح الملف…') : uiStatic('تسجيل متابعة'))}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {query.data && rows.length ? (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
          <p className="nums text-xs text-muted-foreground">{ui('صفحة')} {formatNum(page)} {ui('من')} {formatNum(pages)}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage((value) => value - 1)}>{ui('السابق')}</Button>
            <Button variant="outline" disabled={page >= pages || query.isFetching} onClick={() => setPage((value) => value + 1)}>{ui('التالي')}</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
