import { effectiveTarget, normalizeTargetPeriod, resolveTargetCycle } from './target-period';

describe('target period', () => {
  it('keeps a monthly target for any report inside one month', () => {
    expect(effectiveTarget(20, { mode: 'monthly' }, '2026-08-01', '2026-08-25')).toBe(20);
  });

  it('scales a target configured by number of days', () => {
    expect(effectiveTarget(20, { mode: 'days', days: 10 }, '2026-08-01', '2026-08-20')).toBe(40);
  });

  it('normalizes an invalid custom range back to monthly', () => {
    expect(normalizeTargetPeriod({ mode: 'custom', startDate: '2026-08-20', endDate: '2026-08-01' }))
      .toEqual({ mode: 'monthly', startDate: null, endDate: null, days: null });
  });

  it('resolves a monthly cycle and exposes its automatic reset and payout dates', () => {
    expect(resolveTargetCycle({ mode: 'monthly' }, '2026-08-26')).toEqual({
      mode: 'monthly',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      resetDate: '2026-09-01',
      payoutDate: '2026-09-01',
      state: 'active',
    });
  });

  it('starts a fresh rolling cycle from zero after each configured number of days', () => {
    expect(resolveTargetCycle({ mode: 'days', days: 10, startDate: '2026-08-20' }, '2026-09-02')).toEqual({
      mode: 'days',
      startDate: '2026-08-30',
      endDate: '2026-09-08',
      resetDate: '2026-09-09',
      payoutDate: '2026-09-09',
      state: 'active',
    });
  });

  it('keeps the configured anchor date for rolling day cycles', () => {
    expect(normalizeTargetPeriod({ mode: 'days', days: 10, startDate: '2026-08-20' }))
      .toEqual({ mode: 'days', startDate: '2026-08-20', endDate: null, days: 10 });
  });
});
