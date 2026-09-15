import { ClubTrainersService } from './club-trainers.service';

describe('trainer manager workspace', () => {
  it('combines the trainer target, earnings, payments and ratings without duplicating source data', async () => {
    const prisma = {
      club_trainer_target_periods: {
        findUnique: jest.fn().mockResolvedValue({
          trainer_id: 9,
          period_month: '2026-08',
          target_unit: 'members',
          target_value: 20,
        }),
      },
    };
    const service = new ClubTrainersService(prisma as never, {} as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 } as never);
    jest.spyOn(service, 'findDetails').mockResolvedValue({ trainer: { id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 }, activeSalary: null, statistics: { totalClasses: 8, totalDays: 6, totalEnrollments: 12, uniqueMembers: 5, totalClassRevenue: 400, totalClassCommission: 40 }, classes: [] } as never);
    jest.spyOn(service, 'earningsSummary').mockResolvedValue({ trainerId: 9, periodFrom: '2026-08-01', periodTo: '2026-08-31', classRevenue: 400, subscriptionRevenue: 600, earned: 100, paid: 30, remaining: 70 } as never);
    jest.spyOn(service, 'listEarningPayments').mockResolvedValue([{ id: 3, trainerId: 9 }] as never);
    jest.spyOn(service, 'listRatings').mockResolvedValue([{ id: 1, trainerId: 9, attendanceId: 1, memberId: 7, memberName: 'عضو 1', rating: 5, comment: null, createdAt: new Date() }, { id: 2, trainerId: 9, attendanceId: 2, memberId: 8, memberName: 'عضو 2', rating: 4, comment: null, createdAt: new Date() }] as never);
    await expect(service.workspace(9, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })).resolves.toMatchObject({
      trainer: { id: 9, name: 'كابتن أحمد' }, stats: { sessions: 8, uniqueMembers: 5, revenue: 1000, target: 20, targetUnit: 'members', achievementPct: 25, earned: 100, paid: 30, remaining: 70, ratingCount: 2 }, ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
    });
    expect(prisma.club_trainer_target_periods.findUnique).toHaveBeenCalledWith({
      where: { trainer_id_period_month: { trainer_id: 9, period_month: '2026-08' } },
    });
  });

  it('does not query or return financial, target, or rating rows when their sections are denied', async () => {
    const prisma = { club_trainer_target_periods: { findUnique: jest.fn() } };
    const service = new ClubTrainersService(prisma as never, {} as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 } as never);
    jest.spyOn(service, 'findDetails').mockResolvedValue({ trainer: { id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 }, activeSalary: null, statistics: { totalClasses: 8, totalDays: 6, totalEnrollments: 12, uniqueMembers: 5, totalClassRevenue: 400, totalClassCommission: 40 }, classes: [] } as never);
    const earnings = jest.spyOn(service, 'earningsSummary');
    const payments = jest.spyOn(service, 'listEarningPayments');
    const ratings = jest.spyOn(service, 'listRatings');

    const result = await service.workspace(
      9,
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
      { targets: false, earnings: false, ratings: false },
    );

    expect(prisma.club_trainer_target_periods.findUnique).not.toHaveBeenCalled();
    expect(earnings).not.toHaveBeenCalled();
    expect(payments).not.toHaveBeenCalled();
    expect(ratings).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access: { targets: false, earnings: false, ratings: false },
      stats: { target: null, revenue: null, earned: null, paid: null, remaining: null, ratingAvg: null, ratingCount: null },
      payments: [], ratings: [],
    });
  });
});
