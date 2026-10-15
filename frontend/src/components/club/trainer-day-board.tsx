import { formatDisplayNumber } from '@/lib/number-display';
import { Ban, CircleUserRound, Plus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { MemberAvatar } from '@/components/club/member-avatar';
import { fromMinutes, packLanes, snapToSlot, toMinutes } from '@/components/club/trainer-day-board-model';
import { formatTime, localToday } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import type { BookingBoardDay, BookingBoardEntry, BookingBoardTrainer } from '@/types/fitness';

/** One 30-minute row. 44px keeps two client chips legible inside a one-hour cell. */
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 84;
const TIME_COL_WIDTH = 68;
const TRAINER_COL_WIDTH = 208;
/** Breathing room under the sticky header so the first time label is not cut in half. */
const GRID_TOP_PAD = 12;

function BoardCell({
  entry,
  lane,
  lanes,
  axisStart,
  slotMinutes,
  onOpen,
}: {
  entry: BookingBoardEntry;
  lane: number;
  lanes: number;
  axisStart: number;
  slotMinutes: number;
  onOpen: (entry: BookingBoardEntry) => void;
}) {
  const top = ((toMinutes(entry.startTime) - axisStart) / slotMinutes) * ROW_HEIGHT;
  const height = Math.max(ROW_HEIGHT - 4, (entry.durationMinutes / slotMinutes) * ROW_HEIGHT - 4);
  const width = `calc(${100 / lanes}% - 6px)`;
  const offset = `calc(${(100 / lanes) * lane}% + 3px)`;
  const cancelled = entry.status === 'cancelled';
  const members = entry.members ?? [];
  // Leave room for the title line and the "+N" tail before deciding how many chips fit.
  const visibleMembers = Math.max(0, Math.floor((height - 30) / 21));

  if (entry.kind === 'free') {
    return (
      <button
        type="button"
        onClick={() => onOpen(entry)}
        disabled={!entry.bookable}
        title={`${uiStatic('متاح')} · ${entry.className} · ${formatTime(entry.startTime)}–${formatTime(entry.endTime)}`}
        className={cn(
          'group absolute overflow-hidden rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/[0.07] px-2 py-1.5 text-start transition',
          entry.bookable ? 'hover:border-emerald-500 hover:bg-emerald-500/15' : 'opacity-50',
        )}
        style={{ top, height, insetInlineStart: offset, width }}
      >
        <span className="nums block text-[10px] font-bold text-emerald-700 dark:text-emerald-400" dir="ltr">
          {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {entry.bookable ? <Plus className="size-3.5" /> : null}
          {uiStatic('متاح')}
        </span>
        {height >= 62 ? (
          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{entry.className}</span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      title={`${entry.className} · ${formatTime(entry.startTime)}–${formatTime(entry.endTime)} · ${formatDisplayNumber(entry.enrollmentCount)}/${formatDisplayNumber(entry.maxCapacity)}`}
      className={cn(
        'absolute overflow-hidden rounded-xl border-s-[4px] px-2 py-1.5 text-start shadow-sm transition hover:z-20 hover:shadow-md',
        cancelled && 'opacity-50 line-through',
      )}
      style={{
        top,
        height,
        insetInlineStart: offset,
        width,
        backgroundColor: withAlpha(entry.color, 0.16),
        borderInlineStartColor: entry.color,
      }}
    >
      <span className="flex items-center justify-between gap-1">
        <span className="nums text-[10px] font-bold" dir="ltr" style={{ color: entry.color }}>
          {formatTime(entry.startTime)}
        </span>
        <span
          className={cn(
            'nums shrink-0 rounded-full px-1.5 text-[10px] font-semibold',
            entry.remainingSeats === 0 ? 'bg-destructive/15 text-destructive' : 'bg-background/70 text-muted-foreground',
          )}
        >
          {toArabicDigits(entry.enrollmentCount)}/{toArabicDigits(entry.maxCapacity)}
        </span>
      </span>
      {members.slice(0, visibleMembers).map((member) => (
        <span key={member.memberId} className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-foreground">
          <MemberAvatar
            name={member.memberName}
            profilePicture={member.memberProfilePicture}
            size="sm"
            className="size-4 shrink-0 text-[8px]"
          />
          <span className="truncate">{member.memberName ?? `#${member.memberId}`}</span>
        </span>
      ))}
      {members.length > visibleMembers ? (
        <span className="nums mt-0.5 block text-[10px] text-muted-foreground">
          + {toArabicDigits(members.length - visibleMembers)} {uiStatic('آخرين')}
        </span>
      ) : null}
      {!members.length && height >= 52 ? (
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{entry.className}</span>
      ) : null}
    </button>
  );
}

function TrainerHeader({ trainer }: { trainer: BookingBoardTrainer }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-3">
      <div className="flex items-center gap-2">
        {trainer.imageUrl ? (
          <img src={trainer.imageUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
        ) : (
          <CircleUserRound className="size-8 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{trainer.trainerName}</p>
          <p className="nums truncate text-[11px] text-muted-foreground">
            {toArabicDigits(trainer.bookedSeats)} {uiStatic('عميل')} · {toArabicDigits(trainer.bookedSessions)} {uiStatic('ميعاد')}
          </p>
        </div>
      </div>
      <p className="nums truncate text-[11px]">
        {trainer.freeSlots > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            {toArabicDigits(trainer.freeSlots)} {uiStatic('متاح')}
            {trainer.firstFreeTime ? ` · ${uiStatic('أقرب ميعاد')} ${formatTime(trainer.firstFreeTime)}` : ''}
          </span>
        ) : (
          <span className="text-muted-foreground">{uiStatic('لا توجد مواعيد متاحة')}</span>
        )}
      </p>
    </div>
  );
}

/**
 * The board itself: one day, a column per captain, the clock down the side.
 *
 * A filled cell is a real session with its clients stacked inside it; a dashed cell is a weekly
 * slot nobody has taken yet. Clicking anywhere else in a column books that captain at that time,
 * which is how a captain with no template still gets booked.
 */
export function TrainerDayBoard({
  board,
  loading,
  canBook,
  onOpenEntry,
  onPickEmptyTime,
}: {
  board: BookingBoardDay | undefined;
  loading: boolean;
  canBook: boolean;
  onOpenEntry: (trainer: BookingBoardTrainer, entry: BookingBoardEntry) => void;
  onPickEmptyTime: (trainer: BookingBoardTrainer, startTime: string) => void;
}) {
  const axisStart = toMinutes(board?.axis.startTime ?? '08:00');
  const axisEnd = toMinutes(board?.axis.endTime ?? '22:00');
  const slotMinutes = board?.axis.slotMinutes ?? 30;
  const rowCount = Math.max(1, Math.round((axisEnd - axisStart) / slotMinutes));
  const totalHeight = rowCount * ROW_HEIGHT;
  const isToday = board?.date === localToday();

  const rowTimes = useMemo(
    () => Array.from({ length: rowCount }, (_, index) => fromMinutes(axisStart + index * slotMinutes)),
    [rowCount, axisStart, slotMinutes],
  );

  const nowTop = useMemo(() => {
    if (!isToday) return -1;
    const now = new Date();
    return ((now.getHours() * 60 + now.getMinutes() - axisStart) / slotMinutes) * ROW_HEIGHT;
  }, [isToday, axisStart, slotMinutes]);

  if (!loading && board && board.trainers.length === 0) {
    return (
      <div className="rounded-2xl border bg-card py-20 text-center">
        <Ban className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">{uiStatic('لا يوجد كباتن على الجدول في هذا اليوم')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {uiStatic('فعّل «إظهار كل الكباتن» أو اضبط جداول المدربين الأسبوعية من إعدادات الحصص.')}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-2xl border bg-card" style={{ maxHeight: '72vh' }}>
      <div className="flex min-w-max">
        <div
          className="sticky start-0 z-30 shrink-0 border-e bg-card"
          style={{ width: TIME_COL_WIDTH }}
        >
          <div className="sticky top-0 z-40 border-b bg-muted/40" style={{ height: HEADER_HEIGHT }} />
          <div className="relative bg-muted/10" style={{ height: totalHeight, marginTop: GRID_TOP_PAD }}>
            {rowTimes.map((time, index) => (
              <span
                key={time}
                className={cn(
                  'nums absolute inset-x-0 -translate-y-1/2 px-1 text-center text-[10px]',
                  time.endsWith(':00') ? 'font-semibold text-foreground/70' : 'text-muted-foreground',
                )}
                style={{ top: index * ROW_HEIGHT }}
                dir="ltr"
              >
                {formatTime(time)}
              </span>
            ))}
          </div>
        </div>

        {(board?.trainers ?? []).map((trainer) => {
          const packed = packLanes(trainer.entries);
          return (
            <div key={trainer.trainerId} className="shrink-0 border-e" style={{ width: TRAINER_COL_WIDTH }}>
              <div className="sticky top-0 z-20 border-b bg-muted/40" style={{ height: HEADER_HEIGHT }}>
                <TrainerHeader trainer={trainer} />
              </div>
              <div
                className="relative"
                style={{
                  height: totalHeight,
                  marginTop: GRID_TOP_PAD,
                  backgroundImage: `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${ROW_HEIGHT}px)`,
                }}
                onDoubleClick={(event) => {
                  if (!canBook || board?.isPastDate || event.target !== event.currentTarget) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const raw = axisStart + ((event.clientY - rect.top) / ROW_HEIGHT) * slotMinutes;
                  onPickEmptyTime(trainer, snapToSlot(raw, slotMinutes));
                }}
              >
                {isToday && nowTop >= 0 && nowTop <= totalHeight ? (
                  <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-primary" style={{ top: nowTop }} />
                ) : null}
                {packed.map(({ entry, lane, lanes }) => (
                  <BoardCell
                    key={`${entry.kind}-${entry.classId ?? entry.templateSlotId}-${entry.startTime}`}
                    entry={entry}
                    lane={lane}
                    lanes={lanes}
                    axisStart={axisStart}
                    slotMinutes={slotMinutes}
                    onOpen={(picked) => onOpenEntry(trainer, picked)}
                  />
                ))}
                {!trainer.entries.length ? (
                  <span className="pointer-events-none absolute inset-x-2 top-4 flex items-center justify-center gap-1 rounded-lg border border-dashed py-3 text-[11px] text-muted-foreground">
                    <Users className="size-3.5" /> {uiStatic('يوم فاضي')}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {loading ? (
        <p className="border-t py-4 text-center text-sm text-muted-foreground">{uiStatic('جارٍ تحميل الجدول...')}</p>
      ) : null}
    </div>
  );
}
