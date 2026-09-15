import { normalizeLegacyTime } from './legacy-time.util';

describe('normalizeLegacyTime', () => {
  it.each([
    ['12:44 م', '12:44:00'],
    ['2:44 م', '14:44:00'],
    ['12:05 ص', '00:05:00'],
    ['02:44 PM', '14:44:00'],
    ['14:44', '14:44:00'],
    ['١٤:٤٤', '14:44:00'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeLegacyTime(input)).toBe(expected);
  });

  it('leaves malformed input unchanged so domain validation can reject it', () => {
    expect(normalizeLegacyTime('25:90')).toBe('25:90');
  });
});
