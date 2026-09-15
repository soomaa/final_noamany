import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTime, localDateStr, localToday } from '@/lib/formatters';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';

export interface TrainerScheduleItem {
  id: number;
  className: string;
  classDate: string;
  startTime: string;
  endTime: string;
  hall: { name: string; hallNumber: string } | null;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  color: string;
}

interface TrainerScheduleCalendarProps {
  schedule: TrainerScheduleItem[];
  dateFrom: string;
  dateTo: string;
  onRangeChange: (dateFrom: string, dateTo: string) => void;
}

const weekdayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const statusDetails: Record<TrainerScheduleItem['status'], { label: string; className: string }> = {
  scheduled: { label: 'مجدولة', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  ongoing: { label: 'جارية الآن', className: 'bg-primary/10 text-primary' },
  completed: { label: 'منفذة', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  cancelled: { label: 'ملغاة', className: 'bg-destructive/10 text-destructive' },
};

function parseLocalDate(value: string, fallback = new Date()) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function calendarDays(dateFrom: string, dateTo: string) {
  const first = parseLocalDate(dateFrom);
  const last = parseLocalDate(dateTo, first);
  const rangeStart = first <= last ? first : last;
  const rangeEnd = first <= last ? last : first;
  const gridStart = addDays(rangeStart, -rangeStart.getDay());
  const gridEnd = addDays(rangeEnd, 6 - rangeEnd.getDay());
  const days: string[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) days.push(localDateStr(cursor));
  return days;
}

function monthRange(reference: Date) {
  return {
    from: localDateStr(new Date(reference.getFullYear(), reference.getMonth(), 1)),
    to: localDateStr(new Date(reference.getFullYear(), reference.getMonth() + 1, 0)),
  };
}

function ScheduleEvent({ item, roomy = false }: { item: TrainerScheduleItem; roomy?: boolean }) {
  const status = statusDetails[item.status];
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-s-[4px] px-2 py-2 text-start shadow-sm',
        item.status === 'cancelled' && 'opacity-60',
      )}
      style={{ backgroundColor: withAlpha(item.color, 0.1), borderInlineStartColor: item.color }}
      title={`${item.className} · ${formatTime(item.startTime)} – ${formatTime(item.endTime)}${item.hall ? ` · ${item.hall.name}` : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn('min-w-0 truncate text-xs font-bold text-foreground', item.status === 'cancelled' && 'line-through')}>
          {item.className}
        </p>
        {roomy ? <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', status.className)}>{status.label}</span> : null}
      </div>
      <p className="nums mt-1 flex items-center gap-1 text-[11px] font-semibold text-foreground">
        <Clock3 className="size-3 shrink-0" />
        <span>{formatTime(item.startTime)} – {formatTime(item.endTime)}</span>
      </p>
      {item.hall ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{item.hall.name}{item.hall.hallNumber ? ` · ${item.hall.hallNumber}` : ''}</span>
        </p>
      ) : roomy ? (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="size-3" /> بدون قاعة</p>
      ) : null}
    </div>
  );
}

export function TrainerScheduleCalendar({ schedule, dateFrom, dateTo, onRangeChange }: TrainerScheduleCalendarProps) {
  const today = localToday();
  const days = useMemo(() => calendarDays(dateFrom, dateTo), [dateFrom, dateTo]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, TrainerScheduleItem[]>();
    for (const item of schedule) grouped.set(item.classDate, [...(grouped.get(item.classDate) ?? []), item]);
    for (const items of grouped.values()) items.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return grouped;
  }, [schedule]);
  const firstDate = parseLocalDate(dateFrom);
  const lastDate = parseLocalDate(dateTo, firstDate);
  const sameMonth = firstDate.getFullYear() === lastDate.getFullYear() && firstDate.getMonth() === lastDate.getMonth();
  const title = sameMonth
    ? firstDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })
    : `${firstDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })} – ${lastDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const agendaDays = days.filter((day) => day >= dateFrom && day <= dateTo && ((byDate.get(day)?.length ?? 0) > 0 || day === today));

  const showMonth = (offset: number) => {
    const reference = new Date(firstDate.getFullYear(), firstDate.getMonth() + offset, 1);
    const range = monthRange(reference);
    onRangeChange(range.from, range.to);
  };

  const showCurrentMonth = () => {
    const range = monthRange(new Date());
    onRangeChange(range.from, range.to);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 border-b bg-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /> تقويم مواعيدي</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">كل حصة ظاهرة في يومها بموعد البداية والنهاية والقاعة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="icon" aria-label="الشهر السابق" onClick={() => showMonth(-1)}><ChevronRight className="size-4" /></Button>
          <Button variant="ghost" className="min-w-36 font-semibold" onClick={showCurrentMonth}>{title}</Button>
          <Button variant="outline" size="icon" aria-label="الشهر التالي" onClick={() => showMonth(1)}><ChevronLeft className="size-4" /></Button>
          <span className="ms-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {toArabicDigits(schedule.length)} حصة
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="hidden overflow-x-auto md:block">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {weekdayNames.map((day) => <div key={day} className="border-e p-3 text-center text-xs font-semibold text-muted-foreground last:border-e-0">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const date = parseLocalDate(day);
                const daySchedule = byDate.get(day) ?? [];
                const inSelectedRange = day >= dateFrom && day <= dateTo;
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn(
                      'min-h-40 border-b border-e p-2',
                      (index + 1) % 7 === 0 && 'border-e-0',
                      index >= days.length - 7 && 'border-b-0',
                      !inSelectedRange && 'bg-muted/20 text-muted-foreground',
                      isToday && 'bg-primary/[0.04]',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className={cn('nums flex size-8 items-center justify-center rounded-full text-xs font-bold', isToday && 'bg-primary text-primary-foreground')}>
                        {toArabicDigits(date.getDate())}
                      </span>
                      {date.getDate() === 1 ? <span className="text-[10px] text-muted-foreground">{date.toLocaleDateString('ar-EG', { month: 'short' })}</span> : null}
                    </div>
                    <div className="space-y-1.5">
                      {daySchedule.slice(0, 3).map((item) => <ScheduleEvent key={item.id} item={item} />)}
                      {daySchedule.length > 3 ? <p className="px-1 text-[10px] font-medium text-muted-foreground">+ {toArabicDigits(daySchedule.length - 3)} مواعيد أخرى</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {agendaDays.map((day) => {
            const date = parseLocalDate(day);
            const daySchedule = byDate.get(day) ?? [];
            const isToday = day === today;
            return (
              <section key={day} className={cn('overflow-hidden rounded-xl border', isToday && 'border-primary/40 bg-primary/[0.025]')}>
                <div className="flex items-center gap-3 border-b bg-muted/30 px-3 py-2.5">
                  <span className={cn('nums flex size-9 items-center justify-center rounded-xl bg-background text-sm font-bold shadow-sm', isToday && 'bg-primary text-primary-foreground')}>
                    {toArabicDigits(date.getDate())}
                  </span>
                  <div>
                    <p className="text-sm font-bold">{date.toLocaleDateString('ar-EG', { weekday: 'long' })}{isToday ? ' · اليوم' : ''}</p>
                    <p className="text-xs text-muted-foreground">{date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <span className="nums ms-auto text-xs text-muted-foreground">{toArabicDigits(daySchedule.length)} حصة</span>
                </div>
                <div className="space-y-2 p-3">
                  {daySchedule.map((item) => <ScheduleEvent key={item.id} item={item} roomy />)}
                  {!daySchedule.length ? <p className="py-3 text-center text-xs text-muted-foreground">لا توجد حصص اليوم.</p> : null}
                </div>
              </section>
            );
          })}
        </div>

        {!schedule.length ? (
          <div className="border-t px-4 py-12 text-center">
            <CalendarDays className="mx-auto size-10 text-muted-foreground/50" />
            <p className="mt-3 font-semibold">لا توجد حصص في الفترة المحددة</p>
            <p className="mt-1 text-sm text-muted-foreground">استخدم الأسهم لعرض شهر آخر.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
