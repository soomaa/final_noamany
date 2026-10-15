import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, DoorOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { useClubT } from '@/hooks/use-club-t';

interface PendingSubscription {
  id: number;
  type: string | null;
  endDate: string;
  isLinkedToSessions: boolean;
  sessionsRemaining: number | null;
  allowed: boolean;
  reasons: string[];
}

interface PendingGateEntry {
  id: number;
  memberCode: string;
  memberName: string;
  checkInTime: string;
  subscriptions: PendingSubscription[];
}

/**
 * Members who came through the gate holding several usable subscriptions. The gate let them
 * in and recorded the visit; reception — inside, not at the gate — picks which subscription
 * it was, and only then is a session taken. Renders nothing while the queue is empty.
 */
export function PendingGateEntries({ branchId }: { branchId?: string | number | null }) {
  const { locale } = useLocale();
  const ct = useClubT();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['club-attendance', 'pending-gate', branchId || 'all'],
    queryFn: () =>
      api
        .get<PendingGateEntry[]>('/club-attendance/pending-gate', { params: { branchId: branchId || undefined } })
        .then((response) => response.data),
    refetchInterval: 5_000,
  });

  const resolve = useMutation({
    mutationFn: ({ attendanceId, subscriptionId }: { attendanceId: number; subscriptionId: number }) =>
      api.post(`/club-attendance/${attendanceId}/resolve-subscription`, { subscriptionId }),
    onSuccess: () => {
      toast.success(ct('gateEntries.resolved'));
      void queryClient.invalidateQueries({ queryKey: ['club-attendance'] });
      void queryClient.invalidateQueries({ queryKey: ['club-recent-checkins'] });
    },
    onError: (error) => {
      toast.error(apiError(error));
      void queryClient.invalidateQueries({ queryKey: ['club-attendance', 'pending-gate'] });
    },
  });

  const dismiss = useMutation({
    mutationFn: (attendanceId: number) => api.post(`/club-attendance/${attendanceId}/dismiss-pending`),
    onSuccess: () => {
      toast.success(locale === 'ar' ? 'تمت المراجعة' : 'Reviewed');
      void queryClient.invalidateQueries({ queryKey: ['club-attendance'] });
    },
    onError: (error) => {
      toast.error(apiError(error));
      void queryClient.invalidateQueries({ queryKey: ['club-attendance', 'pending-gate'] });
    },
  });

  const rows = pending.data ?? [];
  if (rows.length === 0) return null;

  const time = (value: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { timeStyle: 'short' }).format(new Date(value));

  return (
    <section
      aria-live="polite"
      className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4"
    >
      <div className="flex items-center gap-2">
        <DoorOpen className="size-5 text-amber-600" />
        <h2 className="font-semibold">
          {ct('gateEntries.title', { count: rows.length })}
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {ct('gateEntries.hint')}
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {row.memberName} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{row.memberCode}</span>
              </span>
              <span className="text-xs text-muted-foreground">{time(row.checkInTime)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.subscriptions.map((sub) => (
                <Button
                  key={sub.id}
                  size="sm"
                  variant={sub.allowed ? 'outline' : 'ghost'}
                  disabled={!sub.allowed || resolve.isPending}
                  title={sub.allowed ? undefined : sub.reasons.join('، ')}
                  onClick={() => resolve.mutate({ attendanceId: row.id, subscriptionId: sub.id })}
                >
                  {sub.type ?? `#${sub.id}`}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {sub.isLinkedToSessions
                      ? ct('gateEntries.sessionsLeft', { count: sub.sessionsRemaining ?? 0 })
                      : ct('gateEntries.until', { date: sub.endDate })}
                  </span>
                </Button>
              ))}
              {row.subscriptions.length === 0 && (
                <span className="text-sm text-destructive">
                  {ct('gateEntries.noUsable')}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                permissionAction={null}
                disabled={dismiss.isPending}
                aria-label={locale === 'ar' ? 'تمت المراجعة' : 'Mark reviewed'}
                onClick={() => dismiss.mutate(row.id)}
              >
                <Check className="size-4" />
                {locale === 'ar' ? 'تمت المراجعة' : 'Reviewed'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
