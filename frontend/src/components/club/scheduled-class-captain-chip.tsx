import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api, apiError } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import type { NextScheduledClass } from '@/types/gym-ops';
import { useLocale } from '@/store/locale';

/**
 * Reception sees the scheduled class a member is about to be checked into — the one running
 * now, or the nearest one today — as a chip in the captain's own colour. Tapping it swaps the
 * captain, for the shifts somebody covers at the last minute.
 */

/** Stable fallback so every captain reads as a distinct colour before anyone picks one. */
const FALLBACK_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2', '#DB2777', '#4F46E5'];
export function trainerColor(trainerId: number, color?: string | null) {
  return color ?? FALLBACK_COLORS[trainerId % FALLBACK_COLORS.length];
}

const shortTime = (value: string) => toArabicDigits(value.slice(0, 5));

export function ScheduledClassCaptainChip({
  memberId,
  subscriptionId,
  branchId,
  canReassign,
  onTrainerChange,
}: {
  memberId: number;
  subscriptionId: number;
  branchId?: number;
  canReassign: boolean;
  /** Reports the captain the check-in should be attributed to. */
  onTrainerChange?: (trainerId: number | null) => void;
}) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryKey = ['club-attendance', 'next-class', memberId, subscriptionId, branchId ?? null];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await api.get<NextScheduledClass>('/club-attendance/next-class', {
      params: { memberId, subscriptionId, branchId },
    })).data,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {ui('جارٍ تحديد الحصة…')}
      </span>
    );
  }
  const slot = data?.class;
  if (!slot) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-200">
        <CalendarClock className="size-3.5" /> {ui('لا توجد حصة مجدولة خلال ساعتين')}
      </span>
    );
  }

  const color = trainerColor(slot.trainerId, slot.trainerColor);
  const when = slot.position === 'now'
    ? ui('جارية الآن')
    : slot.position === 'past'
      ? ui('انتهت للتو')
      : ui('القادمة');
  const others = (data?.eligibleTrainers ?? []).filter((trainer) => trainer.id !== slot.trainerId);

  const reassign = async (trainerId: number) => {
    setSaving(true);
    try {
      await api.post('/club-attendance/class-trainer', { classId: slot.classId, trainerId });
      onTrainerChange?.(trainerId);
      await qc.invalidateQueries({ queryKey });
      setOpen(false);
      toast.success(ui('تم تغيير كابتن الحصة'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const chip = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        canReassign && 'cursor-pointer hover:brightness-95',
      )}
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1A`, color }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {slot.trainerName}
      <span className="opacity-70">· {slot.className}</span>
      <span className="opacity-70 nums">{shortTime(slot.startTime)}</span>
      <span className="opacity-70">({when})</span>
      {canReassign ? <ChevronDown className="size-3.5 opacity-70" /> : null}
    </span>
  );

  if (!canReassign) return chip;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" disabled={saving}>{chip}</button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{ui('غيّر كابتن هذه الحصة')}</p>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent"
          onClick={() => setOpen(false)}
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="flex-1 truncate">{slot.trainerName}</span>
          <Check className="size-4 text-primary" />
        </button>
        {others.map((trainer) => (
          <button
            key={trainer.id}
            type="button"
            disabled={saving}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm hover:bg-accent disabled:opacity-50"
            onClick={() => void reassign(trainer.id)}
          >
            <span className="size-2.5 rounded-full" style={{ backgroundColor: trainerColor(trainer.id, trainer.color) }} />
            <span className="flex-1 truncate">{trainer.name}</span>
          </button>
        ))}
        {!others.length ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{ui('لا يوجد كابتن آخر مؤهل لهذه الحصة')}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
