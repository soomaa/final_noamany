import { ClubTrainersService } from './club-trainers.service';

describe('trainer manager workspace', () => {
  it('exposes canonical workspace and performance aggregate methods', () => {
    const service = new ClubTrainersService({} as never, {} as never);
    expect(typeof (service as unknown as { workspace?: unknown }).workspace).toBe('function');
    expect(typeof (service as unknown as { performance?: unknown }).performance).toBe('function');
  });

  it('combines the selected trainer target, earnings, payments, and ratings without changing sources', async () => {
    const prisma = {
      club_trainer_commission_settings: {
        findUnique: jest.fn().mockResolvedValue({
          employee_id: 90,
          trainer_id: 9,
          target_unit: 'members',
          base_target: 20,
          tiers: [{ id: 1, min_achievement_pct: 0, max_achievement_pct: null, commission_percent: 10, label: 'أساسي' }],
        }),
      },
    };
    const service = new ClubTrainersService(prisma as never, {} as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 } as never);
    jest.spyOn(service, 'findDetails').mockResolvedValue({
      trainer: { id: 9, employeeId: 90, name: 'كابتن أحمد', ratingAvg: 4.5 },
      activeSalary: { id: 2, trainerId: 9 },
      statistics: { totalClasses: 8, totalDays: 6, totalEnrollments: 12, uniqueMembers: 5, totalClassRevenue: 400, totalClassCommission: 40 },
      classes: [{ id: 80 }],
    } as never);
    jest.spyOn(service, 'earningsSummary').mockResolvedValue({
      trainerId: 9,
      periodFrom: '2026-08-01',
      periodTo: '2026-08-31',
      classRevenue: 400,
      classCommission: 40,
      subscriptionRevenue: 600,
      subscriptionCommission: 60,
      privateCommission: 60,
      refundCommission: 0,
      refundBase: 0,
      receiptSources: [],
      attendanceCommission: 100,
      targetCommission: 100,
      commissionMode: 'tiered',
      revenue: 1000,
      target: 20,
      targetUnit: 'members',
      achieved: 5,
      achievementPct: 25,
      commissionPercent: 10,
      achievedTier: 'أساسي',
      totalTrainees: 5,
      earned: 100,
      paid: 30,
      payable: 70,
      remaining: 70,
      overpaid: 0,
    });
    jest.spyOn(service, 'listEarningPayments').mockResolvedValue([{ id: 3, trainerId: 9 }] as never);
    jest.spyOn(service, 'listRatings').mockResolvedValue([
      { id: 1, trainerId: 9, attendanceId: 1, memberId: 7, memberName: 'عضو 1', rating: 5, comment: null, createdAt: new Date() },
      { id: 2, trainerId: 9, attendanceId: 2, memberId: 8, memberName: 'عضو 2', rating: 4, comment: null, createdAt: new Date() },
    ] as never);

    await expect((service as any).workspace(9, { dateFrom: '2026-08-01', dateTo: '2026-08-31' }))
      .resolves.toMatchObject({
        trainer: { id: 9, name: 'كابتن أحمد' },
        stats: { sessions: 8, uniqueMembers: 5, revenue: 1000, target: 20, targetUnit: 'members', achievementPct: 25, earned: 100, paid: 30, remaining: 70, ratingCount: 2 },
        ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
      });
  });
});
