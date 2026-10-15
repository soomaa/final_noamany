import { CalendarCheck2, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, Sparkles, UserCheck, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BookingCellDialog } from '@/components/club/booking-cell-dialog';
import { BranchBookingTree } from '@/components/club/branch-booking-tree';
import { ClassSessionDialog } from '@/components/club/class-session-dialog';
import { QuickBookDialog } from '@/components/club/quick-book-dialog';
import { TrainerDayBoard } from '@/components/club/trainer-day-board';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatTime, localDateStr, localToday } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { cn, toArabicDigits } from '@/lib/utils';
import type {
  BookingBoardDay,
  BookingBoardEntry,
  BookingBoardTarget,
  BookingBoardTrainer,
  ClubClassType,
  ClubHallRow,
  ClubTrainerRow,
} from '@/types/fitness';

const SELECT_CLS = 'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
const PERMISSION = 'club.fitness.booking_board';

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return localDateStr(next);
}

function StatChip({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone?: 'free' }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <Icon className={cn('size-4', tone === 'free' ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary')} />
      <div className="leading-tight">
        <p className="nums text-sm font-bold">{toArabicDigits(value)}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Daily booking board — the front-desk view of "who is free and when".
 *
 * Branch tree on one side, captains as columns, the clock down the middle. Everything on it is
 * one click from a booking: a dashed cell is an open weekly slot, a filled cell with seats left
 * takes another client, and double-clicking blank space books a captain at any time at all.
 */
export function FitnessBookingBoardPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const canBook = can(`${PERMISSION}:create`) || can('club.fitness.personal_sessions:create') || can('club.subscriptions.special:create');
  const canUpdate = can(`${PERMISSION}:update`) || can('club.fitness.personal_sessions:update') || can('club.subscriptions.special:update');
  const canDelete = can(`${PERMISSION}:delete`) || can('club.fitness.personal_sessions:delete') || can('club.subscriptions.special:delete');

  const { data: branches } = useBranches();
  // Day and branch live in the URL: reception refreshes this screen all day, and a manager
  // pastes the link for a specific branch's day into chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const setParam = useCallback((key: string, value: string, fallback: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const date = searchParams.get('date') ?? localToday();
  const setDate = (value: string | ((current: string) => string)) =>
    setParam('date', typeof value === 'function' ? value(date) : value, '');
  const branchId = searchParams.get('branch') ?? 'all';
  const setBranchId = (value: string) => setParam('branch', value, 'all');
  const classTypeId = searchParams.get('classType') ?? 'all';
  const setClassTypeId = (value: string) => setParam('classType', value, 'all');
  const showIdle = searchParams.get('idle') === '1';
  const setShowIdle = (value: boolean) => setParam('idle', value ? '1' : '0', '0');
  const [trainerSearch, setTrainerSearch] = useState('');
  const [bookTarget, setBookTarget] = useState<BookingBoardTarget | null>(null);
  const [openCell, setOpenCell] = useState<{ trainer: BookingBoardTrainer; entry: BookingBoardEntry } | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const boardQueryKey = ['club-booking-board', date, branchId, classTypeId, showIdle] as const;
  const { data: board, isFetching, refetch } = useQuery({
    queryKey: boardQueryKey,
    queryFn: async () => (await api.get<BookingBoardDay>('/club/booking-board/day', {
      params: { date, branchId, classTypeId, showIdle },
    })).data,
  });

  const { data: classTypes } = useQuery({
    queryKey: ['club-class-types'],
    queryFn: async () => (await api.get<ClubClassType[]>('/club-class-types')).data,
  });
  const { data: halls } = useQuery({
    queryKey: ['club-halls', 'board'],
    queryFn: async () => (await api.get<{ data: ClubHallRow[] }>('/club-halls', { params: { page: 1, pageSize: 200 } })).data.data,
  });
  const { data: trainers } = useQuery({
    queryKey: ['club-trainers', 'board'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['club-booking-board'] });
    await qc.invalidateQueries({ queryKey: ['club-calendar'] });
    const fresh = await refetch();
    // Keep an open cell dialog in sync with the board it was opened from.
    setOpenCell((current) => {
      if (!current) return current;
      const trainer = fresh.data?.trainers.find((row) => row.trainerId === current.trainer.trainerId);
      const entry = trainer?.entries.find((item) => item.classId === current.entry.classId);
      return trainer && entry ? { trainer, entry } : null;
    });
  };

  const visibleBoard = useMemo(() => {
    if (!board) return board;
    const term = trainerSearch.trim();
    if (!term) return board;
    return { ...board, trainers: board.trainers.filter((trainer) => trainer.trainerName.includes(term)) };
  }, [board, trainerSearch]);

  const nextFree = useMemo(() => (board?.trainers ?? [])
    .flatMap((trainer) => trainer.entries
      .filter((entry) => entry.kind === 'free' && entry.bookable)
      .map((entry) => ({ trainer, entry })))
    .sort((a, b) => a.entry.startTime.localeCompare(b.entry.startTime))
    .slice(0, 8), [board]);

  const openBooking = (trainer: BookingBoardTrainer, entry?: BookingBoardEntry, startTime?: string) => {
    if (!canBook) {
      toast.error(uiStatic('ليس لديك صلاحية الحجز'));
      return;
    }
    const fallbackBranch = branchId !== 'all' ? Number(branchId) : branches?.[0]?.id ?? 0;
    setBookTarget({
      trainerId: trainer.trainerId,
      trainerName: trainer.trainerName,
      date,
      startTime: entry?.startTime ?? startTime ?? '08:00',
      endTime: entry?.endTime ?? (startTime ? `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:${startTime.slice(3)}` : '09:00'),
      branchId: entry?.branchId ?? fallbackBranch,
      entry,
    });
  };

  const onOpenEntry = (trainer: BookingBoardTrainer, entry: BookingBoardEntry) => {
    if (entry.kind === 'free') {
      openBooking(trainer, entry);
      return;
    }
    setOpenCell({ trainer, entry });
  };

  const generateDefaultDay = async () => {
    if (!canBook) return;
    try {
      const weekStart = addDays(date, -new Date(`${date}T12:00:00`).getDay());
      const { data } = await api.post<{ created: number; skippedCount: number }>('/club-classes/generate-default', {
        weekStart,
        branchId: branchId === 'all' ? undefined : Number(branchId),
        classTypeId: classTypeId === 'all' ? undefined : Number(classTypeId),
      });
      toast[data.created ? 'success' : 'info'](data.created
        ? `${uiStatic('تم تثبيت ')}${toArabicDigits(data.created)}${uiStatic(' حصة من الجدول الافتراضي')}`
        : uiStatic('الجدول الافتراضي مثبت بالفعل لهذا الأسبوع.'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const summary = board?.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title={uiStatic('لوحة حجوزات اليوم')}
        description={uiStatic('كل كابتن في عمود، والمواعيد على اليسار — شوف المحجوز والمتاح واحجز من نفس الشاشة.')}
      />

      <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label={uiStatic('اليوم السابق')} onClick={() => setDate((current) => addDays(current, -1))}>
              <ChevronRight className="size-4" />
            </Button>
            <Input type="date" className="nums h-10 w-40" value={date} onChange={(event) => setDate(event.target.value || localToday())} />
            <Button variant="outline" size="icon" aria-label={uiStatic('اليوم التالي')} onClick={() => setDate((current) => addDays(current, 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant={date === localToday() ? 'secondary' : 'ghost'} onClick={() => setDate(localToday())}>
              {uiStatic('النهاردة')}
            </Button>
          </div>

          <select className={`${SELECT_CLS} w-44`} value={classTypeId} onChange={(event) => setClassTypeId(event.target.value)}>
            <option value="all">{uiStatic('كل أنواع الحصص')}</option>
            {(classTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 w-44 pe-9"
              value={trainerSearch}
              onChange={(event) => setTrainerSearch(event.target.value)}
              placeholder={uiStatic('ابحث عن كابتن...')}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input type="checkbox" className="size-4" checked={showIdle} onChange={(event) => setShowIdle(event.target.checked)} />
            {uiStatic('إظهار كل الكباتن')}
          </label>

          <div className="ms-auto flex items-center gap-2">
            {canBook ? (
              <Button permissionAction="create" variant="outline" onClick={() => void generateDefaultDay()} title={uiStatic('يثبّت جداول المدربين الافتراضية لأسبوع اليوم المعروض')}>
                <Sparkles className="size-4" /> {uiStatic('تثبيت الجدول الافتراضي')}
              </Button>
            ) : null}
            <Button variant="outline" size="icon" aria-label={uiStatic('تحديث')} onClick={() => void refresh()}>
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {summary ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <StatChip icon={UserCheck} label={uiStatic('كابتن على الجدول')} value={summary.trainers} />
            <StatChip icon={CalendarCheck2} label={uiStatic('مواعيد محجوزة')} value={summary.bookedSessions} />
            <StatChip icon={Users} label={uiStatic('عملاء محجوزين')} value={summary.bookedSeats} />
            <StatChip icon={CalendarDays} label={uiStatic('مواعيد متاحة')} value={summary.freeSlots} tone="free" />
            <p className="ms-auto self-center text-xs text-muted-foreground">
              {uiStatic('اضغط على مربع متاح للحجز · دبل كليك على أي وقت فاضي لحجز الكابتن فيه')}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <BranchBookingTree
            branches={branches ?? []}
            stats={board?.branches ?? []}
            value={branchId}
            onChange={setBranchId}
          />

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="border-b bg-muted/20 px-4 py-3">
              <p className="text-sm font-semibold">{uiStatic('أقرب المواعيد المتاحة')}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{uiStatic('اضغط للحجز فورًا')}</p>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {nextFree.map(({ trainer, entry }) => (
                <button
                  key={`${trainer.trainerId}-${entry.templateSlotId}`}
                  type="button"
                  onClick={() => openBooking(trainer, entry)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start transition-colors hover:bg-muted/60"
                >
                  <span className="nums shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400" dir="ltr">
                    {formatTime(entry.startTime)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{trainer.trainerName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{entry.className}</span>
                  </span>
                </button>
              ))}
              {!nextFree.length ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {board?.isPastDate ? uiStatic('يوم قديم — لا يمكن الحجز فيه.') : uiStatic('لا توجد مواعيد متاحة في هذا اليوم.')}
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <TrainerDayBoard
          board={visibleBoard}
          loading={isFetching}
          canBook={canBook}
          onOpenEntry={onOpenEntry}
          onPickEmptyTime={(trainer, startTime) => openBooking(trainer, undefined, startTime)}
        />
      </div>

      <BookingCellDialog
        entry={openCell?.entry ?? null}
        trainerName={openCell?.trainer.trainerName ?? ''}
        date={date}
        canBook={canBook}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onClose={() => setOpenCell(null)}
        onChanged={refresh}
        onAddMember={() => {
          if (!openCell) return;
          openBooking(openCell.trainer, openCell.entry);
          setOpenCell(null);
        }}
        onOpenSession={(id) => { setSessionId(id); setOpenCell(null); }}
      />

      <QuickBookDialog
        target={bookTarget}
        classTypes={classTypes ?? []}
        halls={halls ?? []}
        onClose={() => setBookTarget(null)}
        onBooked={refresh}
      />

      <ClassSessionDialog
        sessionId={sessionId}
        open={sessionId != null}
        onOpenChange={(open) => { if (!open) { setSessionId(null); void refresh(); } }}
        trainers={trainers ?? []}
        halls={halls ?? []}
        permissionResource="club.fitness.personal_sessions"
      />
    </div>
  );
}
