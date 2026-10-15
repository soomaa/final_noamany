import {
  resolveTreasuryPeriod,
  TREASURY_DETAIL_RANGE_LIMIT_DAYS,
} from './treasury-range.util';

describe('resolveTreasuryPeriod', () => {
  it('uses summary-only mode for all-time requests', () => {
    expect(resolveTreasuryPeriod({})).toMatchObject({
      periodMode: 'all',
      summaryOnly: true,
      detailRangeLimitDays: TREASURY_DETAIL_RANGE_LIMIT_DAYS,
    });
  });

  it('keeps details for 90 days and switches to summary at 91 days', () => {
    expect(
      resolveTreasuryPeriod({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }).summaryOnly,
    ).toBe(false);
    expect(
      resolveTreasuryPeriod({ dateFrom: '2026-01-01', dateTo: '2026-04-01' }).summaryOnly,
    ).toBe(true);
  });
});
