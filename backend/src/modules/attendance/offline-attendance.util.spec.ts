import { BadRequestException } from '@nestjs/common';
import { resolveOfflinePunchClock } from './offline-attendance.util';

describe('resolveOfflinePunchClock', () => {
  const receivedAt = new Date('2026-08-23T21:00:00.000Z');

  it('uses the captured Cairo day and time for a punch within 24 hours', () => {
    const clock = resolveOfflinePunchClock(
      '2026-08-23T20:15:00.000Z',
      'Africa/Cairo',
      receivedAt,
    );

    expect(clock).toMatchObject({
      actionDate: '2026-08-23',
      time: '11:15 PM',
      receivedAt,
    });
  });

  it('rejects an offline capture older than 24 hours', () => {
    expect(() => resolveOfflinePunchClock(
      '2026-08-22T20:59:59.999Z',
      'Africa/Cairo',
      receivedAt,
    )).toThrow(BadRequestException);
  });

  it('rejects a future capture time', () => {
    expect(() => resolveOfflinePunchClock(
      '2026-08-23T21:00:00.001Z',
      'Africa/Cairo',
      receivedAt,
    )).toThrow(BadRequestException);
  });
});
