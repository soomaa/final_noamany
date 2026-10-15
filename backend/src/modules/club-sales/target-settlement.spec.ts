import { targetWindowAfterSettlement } from './target-settlement';

describe('targetWindowAfterSettlement', () => {
  it('keeps the requested window when no approved settlement exists', () => {
    expect(targetWindowAfterSettlement('2026-08-01', '2026-08-31', null)).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
      active: true,
    });
  });

  it('starts a fresh target cycle on the day after the last approved payroll period', () => {
    expect(targetWindowAfterSettlement('2026-08-01', '2026-08-31', '2026-08-15')).toEqual({
      start: '2026-08-16',
      end: '2026-08-31',
      active: true,
    });
  });

  it('returns an inactive window when the approved period covers the whole report', () => {
    expect(targetWindowAfterSettlement('2026-08-01', '2026-08-31', '2026-08-31')).toEqual({
      start: '2026-09-01',
      end: '2026-08-31',
      active: false,
    });
  });
});
