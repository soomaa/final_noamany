import { BadRequestException } from '@nestjs/common';
import { missionNumDays } from './mission-bdal.util';

describe('mission date-only duration', () => {
  it('is inclusive and unaffected by Cairo DST', () => {
    expect(missionNumDays('2026-04-23', '2026-04-25')).toBe(3);
    expect(missionNumDays('2026-10-29', '2026-10-31')).toBe(3);
  });

  it('rejects invalid and inverted dates', () => {
    expect(() => missionNumDays('2026-02-30', '2026-03-01')).toThrow(BadRequestException);
    expect(() => missionNumDays('2026-03-02', '2026-03-01')).toThrow(BadRequestException);
  });
});
