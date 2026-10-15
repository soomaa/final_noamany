import { playEntrySound } from '@/lib/entry-sounds';
import { usePermission } from '@/hooks/use-permission';
import { useEffect, useRef, useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/store/locale';

interface EntryAlert {
  id: number;
  memberName: string;
  memberCode: string;
  message: string;
  severity: 'block' | 'warn';
  source: 'gate' | 'reception';
  createdAt: string;
}

export function ReceptionEntryAlerts({ branchId }: { branchId?: string | number | null }) {
  const { ui, locale } = useLocale();
  const titleId = useId();
  const { can } = usePermission();
  const permitted = can('club.members:view') || can('club.members.attendance:view') || can('club.reception:view');
  const seen = useRef<{ branch: string; ids: Set<number> } | null>(null);
  const branch = String(branchId ?? 'all');
  const alerts = useQuery({
    queryKey: ['club-attendance', 'entry-alerts', branch],
    enabled: permitted,
    queryFn: () => api.get<EntryAlert[]>('/club-attendance/entry-alerts', {
      params: { branchId: branchId || undefined }, timeout: 10_000,
    }).then((response) => response.data),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (!alerts.data) return;
    if (seen.current?.branch === branch) {
      let rejectedGateEntry = false;
      for (const alert of alerts.data) {
        if (!seen.current.ids.has(alert.id)) {
          const title = `${alert.memberName} — ${ui(alert.severity === 'block' ? 'محاولة دخول مرفوضة' : 'متبقي مطلوب سداده')}`;
          toast.warning(title, { description: alert.message, duration: 10_000 });
          rejectedGateEntry ||= alert.source === 'gate' && alert.severity === 'block';
        }
      }
      if (rejectedGateEntry) void playEntrySound('rejected', true);
    }
    seen.current = { branch, ids: new Set(alerts.data.map((alert) => alert.id)) };
  }, [alerts.data, branch, ui]);

  if (!permitted) return null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="flex items-center gap-2 font-bold">
          <AlertTriangle className="size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          {ui('تنبيهات الدخول والسداد')}
        </h2>
        <span className="text-sm text-muted-foreground">{ui('آخر ١٠ تنبيهات خلال ٢٤ ساعة')}</span>
      </div>
      {alerts.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <p>{ui('تعذر تحديث تنبيهات الدخول. تحقق من الاتصال وأعد المحاولة.')}</p>
        <Button variant="outline" size="sm" onClick={() => void alerts.refetch()} disabled={alerts.isFetching}>
          <RefreshCw className="size-4" aria-hidden="true" />{ui('إعادة المحاولة')}
        </Button>
      </div>}
      <div aria-live="polite" aria-atomic="false">
        {alerts.isLoading && <p className="text-sm text-muted-foreground">{ui('جارٍ تحميل تنبيهات الدخول…')}</p>}
        {!alerts.isLoading && !alerts.isError && !alerts.data?.length && <p className="text-sm text-muted-foreground">{ui('لا توجد محاولات دخول مرفوضة أو تنبيهات سداد حاليًا.')}</p>}
        {!!alerts.data?.length && <ul className="divide-y">
          {alerts.data.map((alert) => <li key={alert.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1 break-words">
              <p className="font-semibold">{alert.memberName} <span className="text-sm font-normal text-muted-foreground">({alert.memberCode})</span></p>
              <p className="text-sm leading-6">{alert.message}</p>
            </div>
            <div className="flex items-center gap-2 text-sm sm:items-start">
              <span className={alert.severity === 'block' ? 'font-semibold text-destructive' : 'font-semibold text-amber-800 dark:text-amber-300'}>{ui(alert.severity === 'block' ? 'الدخول مرفوض' : 'تذكير بالسداد')}</span>
              <time dateTime={alert.createdAt} className="nums text-muted-foreground">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(alert.createdAt))}</time>
            </div>
          </li>)}
        </ul>}
      </div>
    </section>
  );
}
