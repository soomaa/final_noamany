import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubTrainerTargetPeriodsService } from './club-trainer-target-periods.service';

describe('ClubTrainerTargetPeriodsService', () => {
  const prisma = {
    club_trainers: { findFirst: jest.fn() },
    employees: { findUnique: jest.fn() },
    club_trainer_target_periods: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const scope = { isBranchAllowed: jest.fn() };
  const service = new ClubTrainerTargetPeriodsService(prisma as never, scope as never);
  const user = { sub: 8, level: 2, branch: 3 } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 9, employee_id: 90, name: 'كابتن محمود' });
    prisma.employees.findUnique.mockResolvedValue({ id: 90, branch_id_fk: 3 });
    scope.isBranchAllowed.mockReturnValue(true);
    prisma.club_trainer_target_periods.findMany.mockResolvedValue([]);
    prisma.club_trainer_target_periods.upsert.mockImplementation(async ({ create }: { create: object }) => ({ id: 1, ...create }));
  });

  it('saves one explicit calendar month and keeps it as a history row', async () => {
    const result = await service.upsert(9, '2026-10', { targetValue: 25, targetUnit: 'members', notes: 'خطة أكتوبر' }, user);

    expect(prisma.club_trainer_target_periods.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { trainer_id_period_month: { trainer_id: 9, period_month: '2026-10' } },
      create: expect.objectContaining({
        trainer_id: 9,
        period_month: '2026-10',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        target_value: 25,
        target_unit: 'members',
      }),
    }));
    expect(result).toMatchObject({ trainerId: 9, periodMonth: '2026-10', targetValue: 25 });
  });

  it('rejects malformed months instead of creating overlapping free-form periods', async () => {
    await expect(service.upsert(9, '2026-1', { targetValue: 25 }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.club_trainer_target_periods.upsert).not.toHaveBeenCalled();
  });

  it('fails closed when the trainer belongs to a foreign branch', async () => {
    scope.isBranchAllowed.mockReturnValue(false);
    await expect(service.list(9, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_trainer_target_periods.findMany).not.toHaveBeenCalled();
  });
});
