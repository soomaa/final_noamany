export type TargetPeriodMode = 'monthly' | 'custom' | 'days';

export interface TargetPeriodInput {
  mode?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days?: number | null;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTargetPeriod(input: TargetPeriodInput) {
  if (input.mode === 'custom' && input.startDate && input.endDate
    && datePattern.test(input.startDate) && datePattern.test(input.endDate)
    && input.startDate <= input.endDate) {
    return { mode: 'custom' as const, startDate: input.startDate, endDate: input.endDate, days: null };
  }
  if (input.mode === 'days' && Number.isInteger(Number(input.days)) && Number(input.days) > 0) {
    return {
      mode: 'days' as const,
      startDate: input.startDate && datePattern.test(input.startDate) ? input.startDate : null,
      endDate: null,
      days: Number(input.days),
    };
  }
  return { mode: 'monthly' as const, startDate: null, endDate: null, days: null };
}

function inclusiveDays(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function effectiveTarget(baseTarget: number, input: TargetPeriodInput, dateFrom: string, dateTo: string) {
  const period = normalizeTargetPeriod(input);
  if (period.mode === 'days') {
    return Math.round((baseTarget * inclusiveDays(dateFrom, dateTo) / period.days) * 100) / 100;
  }
  if (period.mode === 'custom') return baseTarget;
  const months = (Number(dateTo.slice(0, 4)) - Number(dateFrom.slice(0, 4))) * 12
    + Number(dateTo.slice(5, 7)) - Number(dateFrom.slice(5, 7)) + 1;
  return Math.round(baseTarget * Math.max(1, months) * 100) / 100;
}

export interface ResolvedTargetCycle {
  mode: TargetPeriodMode;
  startDate: string;
  endDate: string;
  resetDate: string;
  payoutDate: string;
  state: 'upcoming' | 'active' | 'completed';
}

function parseDay(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDay(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

function monthEnd(value: string) {
  const date = parseDay(value);
  return isoDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/**
 * Resolve the cycle that owns `today`. No stored counter is erased: moving into the next
 * date range makes current-cycle achievement start at zero while historical cycles remain queryable.
 */
export function resolveTargetCycle(input: TargetPeriodInput, today: string): ResolvedTargetCycle {
  const safeToday = datePattern.test(today) ? today : isoDay(new Date());
  const period = normalizeTargetPeriod(input);

  if (period.mode === 'custom') {
    const resetDate = addDays(period.endDate, 1);
    return {
      mode: period.mode,
      startDate: period.startDate,
      endDate: period.endDate,
      resetDate,
      payoutDate: resetDate,
      state: safeToday < period.startDate ? 'upcoming' : safeToday > period.endDate ? 'completed' : 'active',
    };
  }

  if (period.mode === 'days') {
    const anchor = period.startDate ?? safeToday;
    const diff = Math.floor((parseDay(safeToday).getTime() - parseDay(anchor).getTime()) / 86_400_000);
    const cycleIndex = diff < 0 ? 0 : Math.floor(diff / period.days);
    const startDate = addDays(anchor, cycleIndex * period.days);
    const endDate = addDays(startDate, period.days - 1);
    const resetDate = addDays(endDate, 1);
    return {
      mode: period.mode,
      startDate,
      endDate,
      resetDate,
      payoutDate: resetDate,
      state: safeToday < anchor ? 'upcoming' : 'active',
    };
  }

  const startDate = `${safeToday.slice(0, 7)}-01`;
  const endDate = monthEnd(safeToday);
  const resetDate = addDays(endDate, 1);
  return {
    mode: period.mode,
    startDate,
    endDate,
    resetDate,
    payoutDate: resetDate,
    state: 'active',
  };
}
