import { TrainerPerformanceService } from './trainer-performance.service';

describe('TrainerPerformanceService', () => {
  const prisma: any = {
    club_trainer_target_overrides: { findUnique: jest.fn() },
    club_trainer_targets: { findUnique: jest.fn() },
    club_trainers: { findFirst: jest.fn() },
  };
  const branchScope: any = { isBranchAllowed: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('uses the selected-month override before the fixed target', async () => {
    prisma.club_trainer_target_overrides.findUnique.mockResolvedValue({ private_sales_target: 6000, subscriptions_target: 4 });
    const service = new TrainerPerformanceService(prisma, branchScope);

    await expect(service.resolveTarget(9, '2026-08')).resolves.toEqual({ privateSalesTarget: 6000, subscriptionsTarget: 4, source: 'override' });
  });

  it('falls back to the fixed target when the month has no override', async () => {
    prisma.club_trainer_target_overrides.findUnique.mockResolvedValue(null);
    prisma.club_trainer_targets.findUnique.mockResolvedValue({ private_sales_target: 3000, subscriptions_target: 2 });
    const service = new TrainerPerformanceService(prisma, branchScope);

    await expect(service.resolveTarget(9, '2026-09')).resolves.toEqual({ privateSalesTarget: 3000, subscriptionsTarget: 2, source: 'default' });
  });
});
