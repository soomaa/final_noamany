import { BadRequestException } from '@nestjs/common';
import { ClubPointsService } from './club-points.service';

describe('ClubPointsService', () => {
  const service = new ClubPointsService({} as never);

  it('converts points using the configured points-to-EGP ratio', () => {
    expect(service.quoteRedemption({
      availablePoints: 120,
      requestedPoints: 80,
      subscriptionValue: 100,
      conversion: { points: 10, value: 2.5, validityDays: 365 },
    })).toEqual({ points: 80, value: 20 });
  });

  it('excludes expired and inactive earned points when calculating a balance', () => {
    expect(service.calculateBalance({
      earned: [
        { points: 100, active: true, expiresOn: '2026-09-21' },
        { points: 50, active: false, expiresOn: '2026-12-01' },
        { points: 30, active: true, expiresOn: '2026-09-20' },
      ],
      exhaustedPoints: 20,
      today: '2026-09-21',
    })).toBe(80);
  });

  it('rejects redemption when another discount is selected', () => {
    expect(() => service.quoteRedemption({
      availablePoints: 100,
      requestedPoints: 10,
      subscriptionValue: 100,
      conversion: { points: 1, value: 1, validityDays: 365 },
      hasOtherDiscount: true,
    })).toThrow(BadRequestException);
  });

  it('rejects a redemption that exceeds either the available points or invoice value', () => {
    expect(() => service.quoteRedemption({
      availablePoints: 20,
      requestedPoints: 21,
      subscriptionValue: 100,
      conversion: { points: 1, value: 1, validityDays: 365 },
    })).toThrow(BadRequestException);

    expect(() => service.quoteRedemption({
      availablePoints: 200,
      requestedPoints: 101,
      subscriptionValue: 100,
      conversion: { points: 1, value: 1, validityDays: 365 },
    })).toThrow(BadRequestException);
  });

  it('rejects an earned-points report whose start date is after its end date', async () => {
    const reportService = new ClubPointsService({
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    } as never);

    await expect(reportService.earnedMembersReport('2026-09-10', '2026-09-01'))
      .rejects.toThrow(BadRequestException);
  });
});
