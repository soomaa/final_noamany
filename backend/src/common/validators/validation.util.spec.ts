import {
  assertCapacity,
  assertDateOrder,
  assertNoOverlap,
  assertOverpayCap,
  assertPositive,
  assertWithinCap,
  intervalsOverlap,
  isCalendarDate,
  assertNotPastDate,
} from './validation.util';

describe('validation.util', () => {
  describe('calendar dates', () => {
    it('rejects rolled-over days and accepts actual leap days', () => {
      expect(isCalendarDate('2027-02-30')).toBe(false);
      expect(isCalendarDate('2027-02-29')).toBe(false);
      expect(isCalendarDate('2028-02-29')).toBe(true);
      expect(() => assertDateOrder('2027-02-30', '2027-03-10')).toThrow('صالحة');
    });
    it('uses the Cairo operating day even before midnight UTC', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-14T22:30:00Z'));
      try {
        expect(() => assertNotPastDate('2026-10-14')).toThrow();
        expect(() => assertNotPastDate('2026-10-15')).not.toThrow();
      } finally { jest.useRealTimers(); }
    });
  });
  describe('assertDateOrder', () => {
    it('allows same day', () => {
      expect(() => assertDateOrder('2026-01-01', '2026-01-01')).not.toThrow();
    });
    it('rejects end before start', () => {
      expect(() => assertDateOrder('2026-01-10', '2026-01-01')).toThrow('تاريخ النهاية');
    });
  });

  describe('assertPositive', () => {
    it('rejects zero by default', () => {
      expect(() => assertPositive(0)).toThrow();
    });
    it('allows zero when flagged', () => {
      expect(assertPositive(0, 'x', true)).toBe(0);
    });
  });

  describe('assertOverpayCap', () => {
    it('rejects overpay', () => {
      expect(() => assertOverpayCap(150, 100)).toThrow('المبلغ المدفوع');
    });
    it('accepts exact pay', () => {
      expect(assertOverpayCap(100, 100)).toBe(100);
    });
  });

  describe('intervalsOverlap', () => {
    it('detects overlap', () => {
      expect(
        intervalsOverlap(
          { start: '2026-01-01', end: '2026-01-10' },
          { start: '2026-01-05', end: '2026-01-15' },
        ),
      ).toBe(true);
    });
    it('allows adjacent non-overlap', () => {
      expect(
        intervalsOverlap(
          { start: '2026-01-01', end: '2026-01-05' },
          { start: '2026-01-05', end: '2026-01-10' },
        ),
      ).toBe(false);
    });
  });

  describe('assertNoOverlap', () => {
    it('throws on conflict', () => {
      expect(() =>
        assertNoOverlap({ start: '2026-01-01', end: '2026-01-10' }, [
          { start: '2026-01-08', end: '2026-01-20', label: 'existing' },
        ]),
      ).toThrow('تداخل');
    });
  });

  describe('assertCapacity', () => {
    it('rejects when full', () => {
      expect(() => assertCapacity(10, 10)).toThrow('السعة');
    });
  });

  describe('assertWithinCap', () => {
    it('rejects over cap', () => {
      expect(() => assertWithinCap(15, 10)).toThrow('تتجاوز');
    });
  });
});
