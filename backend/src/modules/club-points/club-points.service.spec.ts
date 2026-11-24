import { BadRequestException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
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

  describe('رجالي/حريمي/الكل filter on the points reports', () => {
    const men = { level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
    const women = { level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
    const admin = { level: 1 } as never;

    function setup() {
      const $queryRaw = jest.fn().mockResolvedValue([]);
      const reportService = new ClubPointsService({ $queryRaw, $executeRaw: jest.fn() } as never, new BranchScopeService());
      const reportSql = () => $queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
      return { $queryRaw, reportService, reportSql };
    }

    it.each([
      ['earned', (svc: ClubPointsService, user: never, gender?: string) => svc.earnedMembersReport('2026-09-01', '2026-09-30', user, gender)],
      ['active', (svc: ClubPointsService, user: never, gender?: string) => svc.activeMembersReport(user, gender)],
    ] as const)('%s members report: men employee unfiltered by default, filters on a pick, may open women', async (_name, run) => {
      const { reportService, reportSql } = setup();
      await run(reportService, men);
      expect(reportSql().sql).not.toContain('m.gender');

      const picked = setup();
      await run(picked.reportService, men, 'male');
      expect(picked.reportSql().sql).toContain('m.gender = ?');
      expect(picked.reportSql().values).toContain('male');

      const other = setup();
      await expect(run(other.reportService, men, 'female')).resolves.toBeDefined();
      expect(other.reportSql().sql).toContain('m.gender = ?');
      expect(other.reportSql().values).toContain('female');
    });

    it('women employee filters female on a pick and may open men', async () => {
      const { reportService, reportSql } = setup();
      await reportService.activeMembersReport(women, 'female');
      expect(reportSql().values).toContain('female');

      const other = setup();
      await expect(other.reportService.activeMembersReport(women, 'male')).resolves.toBeDefined();
      expect(other.reportSql().values).toContain('male');
    });

    it('admin: gender=female filters female, none is unfiltered', async () => {
      const first = setup();
      await first.reportService.earnedMembersReport('2026-09-01', '2026-09-30', admin, 'female');
      expect(first.reportSql().sql).toContain('m.gender = ?');
      expect(first.reportSql().values).toContain('female');
      const second = setup();
      await second.reportService.earnedMembersReport('2026-09-01', '2026-09-30', admin);
      expect(second.reportSql().sql).not.toContain('m.gender');
    });
  });
});
