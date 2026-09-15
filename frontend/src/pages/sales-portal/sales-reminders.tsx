import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, Check, Clock3, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/common/states';
import { api, apiError } from '@/lib/api';
import { formatDateTime, formatNum } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { cn } from '@/lib/utils';
import type { SalesLead } from './portal-types';
import { clampSalesPage, toSalesDialLink } from './sales-workspace-model';

type Reminder = { id: string; kind: 'call' | 'follow_up'; dueAt: string; lead: SalesLead };
type RemindersResponse = { data: Reminder[]; page: number; pageSize: number; total: number; overdue: number };

export function SalesReminders({ active, onSelect }: { active: boolean; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [completing, setCompleting] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['sales-portal', 'reminders', page],
    enabled: active,
    refetchInterval: 30_000,
    queryFn: async () => (await api.get<RemindersResponse>('/club-leads/reminders', { params: { page, pageSize: 25 } })).data,
  });
  const finish = async (item: Reminder) => {
    if (completing) return;
    setCompleting(item.id);
    try {
      await api.post(`/club-leads/${item.lead.id}/reminders/complete`, { kind: item.kind, dueAt: item.dueAt });
      await Promise.all([qc.invalidateQueries({ queryKey: ['sales-portal'] }), qc.invalidateQueries({ queryKey: ['club-lead', item.lead.id] })]);
      toast.success(ui('تم إنجاز التنبيه'));
    } catch (error) { toast.error(apiError(error)); }
    finally { setCompleting(null); }
  };
  const data = query.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  useEffect(() => {
    if (data) setPage((current) => clampSalesPage(current, data.total, data.pageSize));
  }, [data]);
  return <section className="overflow-hidden rounded-xl border bg-card" aria-label={ui('تنبيهات المبيعات')}>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-primary/5 p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Bell className="size-5" /></span><div><h2 className="text-lg font-extrabold">{ui('تنبيهات التواصل')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('المواعيد المتأخرة أولًا، ثم الأقرب.')}</p></div></div>
      {data ? <div className="flex gap-3 text-sm nums" aria-live="polite"><span className="rounded-lg border bg-card px-3 py-2">{formatNum(data.total)} {ui('موعد')}</span>{data.overdue > 0 ? <span className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">{formatNum(data.overdue)} {ui('متأخر')}</span> : null}</div> : null}
    </div>
    {query.isLoading ? <div className="space-y-3 p-5">{[1,2,3].map(n => <Skeleton key={n} className="h-24 rounded-lg" />)}</div> : query.isError ? <ErrorState inline onRetry={() => void query.refetch()} /> : !data?.data.length ? <EmptyState title={ui('لا توجد مواعيد معلقة')} description={ui('حدد موعد الاتصال أو المتابعة من ملف العميل، وسيظهر هنا تلقائيًا.')} /> : <>
      <ol className="divide-y">{data.data.map((item, index) => { const overdue = new Date(item.dueAt).getTime() < Date.now(); const Icon = item.kind === 'call' ? Phone : CalendarDays; const dialLink = toSalesDialLink(item.lead.phone); return <li key={item.id} className="flex flex-wrap items-center gap-4 p-4 sm:px-6 sm:py-5"><span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/15 text-foreground')}><Icon className="size-5" /></span><div className="min-w-0 flex-1 basis-40"><p className="mb-1 text-xs font-semibold text-muted-foreground">{ui(item.kind === 'call' ? 'موعد اتصال' : 'موعد متابعة')} · <span className="nums">{formatNum((data.page - 1) * data.pageSize + index + 1)}</span></p><button type="button" className="min-h-12 text-start text-base font-extrabold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(item.lead)}>{item.lead.fullName}</button><p className="nums text-xs text-muted-foreground"><bdi dir="ltr">{item.lead.phone}</bdi></p></div><div className="min-w-36 space-y-1"><p className={cn('flex items-center gap-1.5 text-xs font-bold', overdue ? 'text-destructive' : 'text-muted-foreground')}><Clock3 className="size-3.5" />{ui(overdue ? 'متأخر — يحتاج تواصل' : 'قادم')}</p><p className="nums text-sm font-semibold">{formatDateTime(item.dueAt)}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto">{dialLink ? <Button variant="brand" asChild><a href={dialLink} aria-label={`${ui('اتصال')} ${item.lead.fullName}`}><Phone className="size-4" />{ui('اتصال')}</a></Button> : null}<Button variant="outline" onClick={() => onSelect(item.lead)}>{ui('فتح الملف')}</Button><Button variant="ghost" disabled={completing != null} aria-label={`${ui(completing === item.id ? 'جارٍ الحفظ…' : 'تمت المتابعة')} — ${item.lead.fullName}`} onClick={() => void finish(item)}><Check className="size-4" />{ui(completing === item.id ? 'جارٍ الحفظ…' : 'تمت المتابعة')}</Button></div></li>; })}</ol>
      <div className="flex items-center justify-between gap-3 border-t px-5 py-4"><p className="nums text-xs text-muted-foreground">{ui('صفحة')} {formatNum(data.page)} {ui('من')} {formatNum(pages)}</p><div className="flex gap-2"><Button variant="outline" disabled={data.page <= 1 || query.isFetching} onClick={() => setPage(data.page - 1)}>{ui('السابق')}</Button><Button variant="outline" disabled={data.page >= pages || query.isFetching} onClick={() => setPage(data.page + 1)}>{ui('التالي')}</Button></div></div>
    </>}
  </section>;
}
