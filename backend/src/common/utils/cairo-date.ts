import { BadRequestException } from '@nestjs/common';

export const CAIRO_TIME_ZONE = 'Africa/Cairo';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const midnightCache = new Map<string, number>();

export function cairoDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO_TIME_ZONE }).format(date);
}

export function cairoDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function cairoTimeString(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function cairoTimeParts(date = new Date()): { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { hour: value('hour'), minute: value('minute'), second: value('second') };
}

export function dateOnlyParts(value: string): { year: number; month: number; day: number } {
  if (!DATE_ONLY.test(value)) throw new BadRequestException('صيغة التاريخ يجب أن تكون YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (check !== value) throw new BadRequestException('التاريخ غير صحيح');
  return { year, month, day };
}

/** Integer day index for calendar arithmetic; never interpret it as a business instant. */
export function dateOnlyOrdinal(value: string): number {
  const { year, month, day } = dateOnlyParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Canonical legacy epoch for a date-only value: the first real instant in Cairo. */
export function dateOnlyEpochSeconds(value: string): number {
  return Math.floor(cairoMidnightUtc(value).getTime() / 1000);
}

/** Canonical UTC Date representation for database DATE/DATETIME columns. */
export function dateOnlyUtcDate(value: string): Date {
  const { year, month, day } = dateOnlyParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDateOnlyDays(value: string, days: number): string {
  if (!Number.isInteger(days)) throw new BadRequestException('عدد الأيام يجب أن يكون عددًا صحيحًا');
  const { year, month, day } = dateOnlyParts(value);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function nextDateOnly(value: string) {
  const { year, month, day } = dateOnlyParts(value);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

export function cairoMidnightUtc(value: string) {
  if (!DATE_ONLY.test(value)) throw new BadRequestException('صيغة التاريخ يجب أن تكون YYYY-MM-DD');
  const cached = midnightCache.get(value);
  if (cached != null) return new Date(cached);
  const [year, month, day] = value.split('-').map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  let low = anchor - (36 * 60 * 60 * 1000);
  let high = anchor + (36 * 60 * 60 * 1000);
  // Calendar dates in one timezone are monotonic even through DST gaps/repeated hours.
  // Find the earliest real instant whose Cairo calendar date is the requested date.
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (cairoDateString(new Date(mid)) < value) low = mid + 1;
    else high = mid;
  }
  if (cairoDateString(new Date(low)) !== value) {
    throw new BadRequestException('التاريخ غير صحيح');
  }
  midnightCache.set(value, low);
  return new Date(low);
}

export function cairoDateBounds(dateFrom?: string, dateTo?: string) {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new BadRequestException('تاريخ البداية يجب ألا يكون بعد تاريخ النهاية');
  }
  const start = dateFrom ? cairoMidnightUtc(dateFrom) : undefined;
  if (dateTo) cairoMidnightUtc(dateTo);
  const endExclusive = dateTo ? cairoMidnightUtc(nextDateOnly(dateTo)) : undefined;
  return { start, endExclusive };
}

