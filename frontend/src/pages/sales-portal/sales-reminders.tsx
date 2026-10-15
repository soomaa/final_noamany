import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarDays, Check, Clock3, Copy, FolderOpen, MessageCircle, Phone, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { formatDateTime, formatNum } from '@/lib/formatters';
import { toDialLink, toWhatsAppLink } from '@/lib/contact-links';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { SalesLead } from './index';
import { uiStatic } from '@/lib/ui-static';

type Reminder = {
  id: string;
  kind: 'call' | 'follow_up';
  dueAt: string;
  lead: SalesLead;
};

type RemindersResponse = {
  data: Reminder[];
  page: number;
  pageSize: number;
  total: number;
  overdue: number;
};

export function SalesReminders({
  active,
  onSelect,
}: {
  active: boolean;
  onSelect: (lead: SalesLead) => void;
}) {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [completing, setCompleting] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['sales-reminders', page],
    enabled: active,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (previous: RemindersResponse | undefined) => previous,
    queryFn: async () =>
      (await api.get<RemindersResponse>('/club-leads/reminders', { params: { page, pageSize: 25 } }))
        .data,
  });

  const finish = async (item: Reminder) => {
    if (completing) return;
    setCompleting(item.id);
    try {
      await api.post(`/club-leads/${item.lead.id}/reminders/complete`, {
        kind: item.kind,
        dueAt: item.dueAt,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales-reminders'] }),
        queryClient.invalidateQueries({ queryKey: ['club-lead', item.lead.id] }),
      ]);
      toast.success(ui('تم إنجاز التنبيه'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCompleting(null);
    }
  };

  const copyPhone = async (item: Reminder) => {
    try {
      await navigator.clipboard.writeText(item.lead.phone);
      toast.success(ui('تم نسخ رقم الموبايل'));
    } catch {
      toast.error(ui('تعذر نسخ الرقم. افتح الملف لنسخه يدويًا.'));
    }
  };

  const data = query.data;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={ui('تنبيهات المبيعات')}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-primary/5 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bell className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">{ui('تنبيهات التواصل')}</h2>
            <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
              {ui('المواعيد المتأخرة أولًا، ثم الأقرب. افتح ملف العميل قبل تسجيل النتيجة.')}
            </p>
          </div>
        </div>
        {data ? (
          <div className="flex flex-wrap gap-2 text-sm nums" aria-live="polite">
            <span className="rounded-lg border bg-card px-3 py-2">{formatNum(data.total)} {ui('موعد')}</span>
            {data.overdue > 0 ? (
              <span className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">
                {formatNum(data.overdue)} {ui('متأخر')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="space-y-3 p-5">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-28 rounded-lg" />)}</div>
      ) : query.isError ? (
        <ErrorState inline onRetry={() => void query.refetch()} />
      ) : !data?.data.length ? (
        <EmptyState title={ui('لا توجد مواعيد معلقة')} description={ui('حدد موعد الاتصال أو المتابعة من ملف العميل وسيظهر هنا.')} />
      ) : (
        <>
          <ol className="divide-y">
            {data.data.map((item, index) => {
              const overdue = new Date(item.dueAt).getTime() < Date.now();
              const Icon = item.kind === 'call' ? Phone : CalendarDays;
              return (
                <li key={item.id} className="grid gap-4 p-4 sm:px-6 sm:py-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                  <span className={cn('flex size-11 items-center justify-center rounded-full', overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/15 text-foreground')}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {ui(item.kind === 'call' ? uiStatic('موعد اتصال') : uiStatic('موعد متابعة'))} · {formatNum((data.page - 1) * data.pageSize + index + 1)}
                    </p>
                    <button type="button" className="mt-1 min-h-11 max-w-full break-words text-start text-base font-extrabold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect(item.lead)}>
                      {item.lead.fullName}
                    </button>
                    <p className={cn('mt-1 flex items-center gap-1.5 text-xs font-semibold', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {ui(overdue ? uiStatic('متأخر — يحتاج تواصل') : uiStatic('قادم'))} · <span className="nums">{formatDateTime(item.dueAt)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {toDialLink(item.lead.phone) ? <Button asChild size="icon" variant="outline"><a href={toDialLink(item.lead.phone)!} aria-label={ui('اتصال')}><PhoneCall className="size-4" /></a></Button> : null}
                    {toWhatsAppLink(item.lead.phone) ? <Button asChild size="icon" variant="outline"><a href={toWhatsAppLink(item.lead.phone)!} target="_blank" rel="noreferrer" aria-label={ui('فتح واتساب')}><MessageCircle className="size-4" /></a></Button> : null}
                    <Button variant="outline" onClick={() => void copyPhone(item)}><Copy className="size-4" />{ui('نسخ الرقم')}</Button>
                    <Button variant="outline" onClick={() => onSelect(item.lead)}><FolderOpen className="size-4" />{ui('فتح الملف')}</Button>
                    <Button variant="ghost" disabled={completing != null} onClick={() => void finish(item)}>
                      <Check className="size-4" />{ui(completing === item.id ? uiStatic('جارٍ الحفظ…') : uiStatic('تمت المتابعة'))}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
            <p className="nums text-xs text-muted-foreground">{ui('صفحة')} {formatNum(data.page)} {ui('من')} {formatNum(pages)}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={data.page <= 1 || query.isFetching} onClick={() => setPage(data.page - 1)}>{ui('السابق')}</Button>
              <Button variant="outline" disabled={data.page >= pages || query.isFetching} onClick={() => setPage(data.page + 1)}>{ui('التالي')}</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
