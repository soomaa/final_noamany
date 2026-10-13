import { daysBetween } from './club-subscription.utils';

describe('subscription calendar days', () => {
  it.each([
    ['2026-10-12', '2026-11-01', 20],
    ['2026-10-29', '2026-10-30', 1],
    ['2026-04-23', '2026-04-24', 1],
    ['2026-11-01', '2026-10-12', -20],
    ['2026-10-12', '2026-10-12', 0],
  ])('counts %s to %s as %i calendar days across daylight saving changes', (start, end, expected) => {
    expect(daysBetween(start, end)).toBe(expected);
  });
});
