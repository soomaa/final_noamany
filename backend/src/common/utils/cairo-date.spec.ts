import { addDateOnlyDays, cairoDateBounds, cairoDateParts, cairoDateString, cairoMidnightUtc, cairoTimeString, dateOnlyEpochSeconds, dateOnlyOrdinal } from './cairo-date';
import { diffDaysFromToday, legacyDateMatchValues, todayIso, toIsoDate } from './legacy-date.util';

describe('Cairo calendar boundaries', () => {
  it('chooses the first real instant of the DST-start date when local midnight is skipped', () => {
    expect(cairoMidnightUtc('2026-04-24').toISOString()).toBe('2026-04-23T22:00:00.000Z');
  });

  it('chooses the first instant after the repeated hour at DST end', () => {
    expect(cairoMidnightUtc('2026-10-30').toISOString()).toBe('2026-10-29T22:00:00.000Z');
  });

  it('keeps adjacent report ranges contiguous across both DST changes', () => {
    const beforeStart = cairoDateBounds('2026-04-23', '2026-04-23');
    const atStart = cairoDateBounds('2026-04-24', '2026-04-24');
    const beforeEnd = cairoDateBounds('2026-10-29', '2026-10-29');
    const atEnd = cairoDateBounds('2026-10-30', '2026-10-30');

    expect(beforeStart.endExclusive).toEqual(atStart.start);
    expect(beforeEnd.endExclusive).toEqual(atEnd.start);
  });

  it('formats HR today in Africa/Cairo rather than UTC', () => {
    const utcMidnight = new Date('2026-08-24T00:30:00.000Z');
    expect(cairoDateString(utcMidnight)).toBe('2026-08-24');
    const justAfterUtcMidnight = new Date('2026-08-23T22:30:00.000Z');
    expect(cairoDateString(justAfterUtcMidnight)).toBe('2026-08-24');
  });

  it('derives Cairo month/year/time when UTC is still on the previous day', () => {
    const instant = new Date('2026-12-31T22:30:00.000Z');
    expect(cairoDateParts(instant)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(cairoTimeString(instant)).toBe('12:30 AM');
  });

  it('keeps the legacy today helper on the Cairo business date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-31T22:30:00.000Z'));
    expect(todayIso()).toBe('2027-01-01');
    jest.useRealTimers();
  });

  it('adds date-only days across month/year boundaries without server timezone math', () => {
    expect(addDateOnlyDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDateOnlyDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('maps legacy date-only attendance epochs to Cairo midnight across DST', () => {
    expect(legacyDateMatchValues('2026-04-24')).toEqual([
      '2026-04-24',
      String(Math.floor(cairoMidnightUtc('2026-04-24').getTime() / 1000)),
    ]);
  });

  it('provides one canonical Cairo epoch and timezone-neutral ordinal for date-only fields', () => {
    expect(dateOnlyEpochSeconds('2026-04-24')).toBe(
      Math.floor(cairoMidnightUtc('2026-04-24').getTime() / 1000),
    );
    expect(dateOnlyOrdinal('2026-04-25') - dateOnlyOrdinal('2026-04-24')).toBe(1);
  });

  it('normalizes legacy date-only values without shifting them to the previous UTC day', () => {
    expect(toIsoDate('2026-08-26')).toBe('2026-08-26');
    expect(toIsoDate('26/08/2026')).toBe('2026-08-26');
  });

  it('computes expiry differences from Cairo date-only days across a DST boundary', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-23T21:30:00.000Z'));
    expect(todayIso()).toBe('2026-04-23');
    expect(diffDaysFromToday('2026-04-25')).toBe(2);
    jest.useRealTimers();
  });
});
