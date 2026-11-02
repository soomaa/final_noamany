import { legacyBusinessIsoDate } from './legacy-date.util';

describe('legacyBusinessIsoDate', () => {
  it('reads a PHP Cairo-midnight timestamp as that Cairo day', () => {
    // 2024-10-22 00:00 Cairo (UTC+3) = 2024-10-21 21:00 UTC
    expect(legacyBusinessIsoDate('1729544400')).toBe('2024-10-22');
  });

  it('keeps ISO dates and empty values', () => {
    expect(legacyBusinessIsoDate('2026-08-24')).toBe('2026-08-24');
    expect(legacyBusinessIsoDate(null)).toBeUndefined();
  });
});
