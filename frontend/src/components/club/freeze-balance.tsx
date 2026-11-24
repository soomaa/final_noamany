import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, LogIn, Pencil, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { cn, toArabicDigits } from '@/lib/utils';

interface FreezePreview {
  allowed: boolean;
  totalTimes: number | null;
  usedTimes: number;
  remainingTimes: number | null;
  totalDays: number | null;
  usedDays: number;
  remainingDays: number | null;
  history: Array<{
    id: number;
    startDate: string;
    endDate: string | null;
    days: number;
    status: 'active' | 'ended' | 'scheduled';
    reason: string | null;
    remainingDaysAfter: number | null;
    /** false for a subscription synced from the old system (its freezes are changed there). */
    editable?: boolean;
  }>;
}

/** Days a freeze from `start` to `end` takes, counted the way the server counts them. */
export function freezeDays(start: string, end: string): number | undefined {
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : undefined;
}

/**
 * The subscription's freeze balance (days and times left) and its freeze history, shown in the
 * freeze dialog so reception sees the limit before saving. `requestedDays` warns when the
 * chosen period is longer than what is left.
 */
const STATUS_LABEL = { active: 'جاري', scheduled: 'محجوز', ended: 'خلص' } as const;
const STATUS_CLASS = {
  active: 'bg-sky-600 text-white',
  scheduled: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  ended: 'bg-muted text-muted-foreground',
} as const;

export function FreezeBalance({ subscriptionId, requestedDays, onChanged }: {
  subscriptionId: number | null;
  requestedDays?: number;
  /** After a freeze was edited or deleted (the subscription dates changed). */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDays, setEditDays] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['club-subscription-freeze-preview', subscriptionId],
    enabled: subscriptionId != null,
    // Opened right after a freeze elsewhere; always read the current balance.
    staleTime: 0,
    queryFn: async () => (await api.get<FreezePreview>(`/club-subscriptions/${subscriptionId}/freeze-preview`)).data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['club-subscription-freeze-preview', subscriptionId] });
    onChanged?.();
  };
  const saveDays = async (freezeId: number) => {
    const days = Math.floor(Number(editDays));
    if (!Number.isInteger(days) || days < 1) { toast.error('اكتب عدد أيام صحيح'); return; }
    setBusyId(freezeId);
    try {
      await api.patch(`/club-subscriptions/${subscriptionId}/freezes/${freezeId}`, { days });
      toast.success('تم تعديل أيام الإيقاف');
      setEditingId(null);
      refresh();
    } catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };
  /** Days stopped so far for a freeze running since `start` (counted like the server: start → today). */
  const usedSoFar = (start: string) => {
    const now = new Date();
    const today = Date.parse(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`);
    return Math.max(0, Math.round((today - Date.parse(`${start}T12:00:00`)) / 86_400_000));
  };
  /**
   * «متابعة الحضور» (client, 22 Nov): the member is back today. Only the days actually stopped
   * count; the rest come off the end date and go back to the balance (the early unfreeze).
   */
  const resume = async (row: FreezePreview['history'][number]) => {
    const used = usedSoFar(row.startDate);
    const ok = await confirm({
      title: 'متابعة الحضور من النهارده؟',
      description: `هيتحسب من الإيقاف ${toArabicDigits(used)} يوم بس (من ${toArabicDigits(row.startDate)} لحد النهارده)، والباقي يرجع للرصيد ويتشال من آخر الاشتراك. العضو يدخل عادي من النهارده.`,
      confirmLabel: 'متابعة الحضور',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api.post(`/club-subscriptions/${subscriptionId}/unfreeze`, {});
      toast.success('العضو رجع يحضر من النهارده');
      refresh();
    } catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };
  /** A booking that has not started yet is simply cancelled: no day was used. */
  const cancelBooking = async (freezeId: number) => {
    const ok = await confirm({ title: 'إلغاء حجز الإيقاف؟', description: 'الإيقاف لسه ما بدأش، فمفيش أيام هتتحسب والرصيد يفضل زي ما هو.', confirmLabel: 'إلغاء الحجز' });
    if (!ok) return;
    setBusyId(freezeId);
    try {
      await api.delete(`/club-subscriptions/${subscriptionId}/freezes/${freezeId}`);
      toast.success('اتلغى حجز الإيقاف');
      refresh();
    } catch (e) { toast.error(apiError(e)); } finally { setBusyId(null); }
  };

  if (subscriptionId == null) return null;
  if (isLoading) return <p role="status" className="text-sm text-muted-foreground">جاري تحميل رصيد التجميد…</p>;
  if (isError || !data) return <p className="text-sm text-muted-foreground">تعذر تحميل رصيد التجميد</p>;

  const tooLong = requestedDays != null && data.remainingDays != null && requestedDays > data.remainingDays;
  const unlimited = 'بدون حد';
  return (
    <div className="space-y-2">
      <div className={cn('grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm', tooLong ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/30')}>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Snowflake className="size-3.5" />أيام التجميد المتبقية</p>
          <p className="nums font-bold">
            {data.remainingDays == null ? unlimited : `${toArabicDigits(data.remainingDays)} من ${toArabicDigits(data.totalDays ?? 0)} يوم`}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">مرات التجميد المتبقية</p>
          <p className="nums font-bold">
            {data.remainingTimes == null ? unlimited : `${toArabicDigits(data.remainingTimes)} من ${toArabicDigits(data.totalTimes ?? 0)}`}
          </p>
        </div>
        {tooLong ? (
          <p className="col-span-2 text-xs font-semibold text-destructive">
            المدة المختارة {toArabicDigits(requestedDays ?? 0)} يوم أكبر من المتبقي ({toArabicDigits(data.remainingDays ?? 0)} يوم)
          </p>
        ) : null}
        {!data.allowed ? <p className="col-span-2 text-xs font-semibold text-destructive">نوع الاشتراك لا يدعم التجميد</p> : null}
      </div>
      {data.history.length ? (
        <div className="space-y-1.5 rounded-xl border p-2 text-sm">
          <p className="px-1 text-xs font-semibold">سجل الإيقاف ({toArabicDigits(data.history.length)})</p>
          <ul className="max-h-60 space-y-1.5 overflow-y-auto">
            {data.history.map((row) => (
              <li key={row.id} className="rounded-lg bg-muted/30 px-2.5 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_CLASS[row.status])}>{STATUS_LABEL[row.status]}</span>
                  <span className="nums">{toArabicDigits(row.startDate)}{row.endDate ? ` ← ${toArabicDigits(row.endDate)}` : ''}</span>
                  <b className="nums ms-auto">{toArabicDigits(row.days)} يوم</b>
                </div>
                {row.remainingDaysAfter != null ? (
                  <p className="nums mt-1 text-muted-foreground">المتبقي من الرصيد بعده: {toArabicDigits(row.remainingDaysAfter)} يوم</p>
                ) : null}
                {row.editable !== false ? (
                  editingId === row.id ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input type="number" min={1} step={1} inputMode="numeric" className="nums h-8 w-24" autoFocus value={editDays}
                        onChange={(e) => setEditDays(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveDays(row.id); } }} />
                      <span className="text-muted-foreground">يوم</span>
                      <Button size="sm" className="h-8" disabled={busyId === row.id} onClick={() => void saveDays(row.id)}>حفظ</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>إلغاء</Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" disabled={busyId != null}
                        onClick={() => { setEditingId(row.id); setEditDays(String(row.days)); }}>
                        <Pencil className="size-3.5" />تعديل الأيام
                      </Button>
                      {row.status === 'active' ? (
                        <Button size="sm" className="h-7 gap-1 px-2 text-xs" disabled={busyId != null} onClick={() => void resume(row)}>
                          <LogIn className="size-3.5" />متابعة الحضور
                        </Button>
                      ) : row.status === 'scheduled' ? (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive" disabled={busyId != null}
                          onClick={() => void cancelBooking(row.id)}>
                          <CalendarX2 className="size-3.5" />إلغاء الحجز
                        </Button>
                      ) : null}
                    </div>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
