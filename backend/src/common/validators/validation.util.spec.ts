import {
  assertCapacity,
  assertDateOrder,
  assertNoOverlap,
  assertOverpayCap,
  assertPositive,
  assertWithinCap,
  intervalsOverlap,
} from './validation.util';

describe('validation.util', () => {
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
