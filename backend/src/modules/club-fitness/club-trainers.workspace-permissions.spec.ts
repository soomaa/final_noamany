import { ClubTrainersController } from './club-trainers.controller';

describe('trainer manager workspace permissions', () => {
  it('derives sensitive workspace sections from server-side RBAC', async () => {
    const trainers = { workspace: jest.fn().mockResolvedValue({}) };
    const permissions = {
      canAny: jest.fn(async (_userId: number, keys: string[]) => keys[0] !== 'club.fitness.trainer_ratings:view'),
    };
    const targetPeriods = { assertAccess: jest.fn() };
    const branchScope = {
      allowedBranchIds: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
      resolveListFilter: jest.fn().mockReturnValue([3]),
    };
    const controller = new ClubTrainersController(trainers as never, targetPeriods as never, permissions as never, branchScope as never);

    await controller.workspace(9, '2026-09-01', '2026-09-30', { sub: 77 } as never);

    expect(trainers.workspace).toHaveBeenCalledWith(
      9,
      { dateFrom: '2026-09-01', dateTo: '2026-09-30' },
      { targets: true, earnings: true, ratings: false },
    );
    expect(targetPeriods.assertAccess).toHaveBeenCalledWith(9, { sub: 77 });
  });

  it('applies the authenticated branch scope to trainer lists, statistics, and payment history', async () => {
    const trainers = {
      list: jest.fn(),
      statistics: jest.fn(),
      listEarningPayments: jest.fn(),
    };
    const branchScope = {
      allowedBranchIds: jest.fn().mockReturnValue([3]),
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    };
    const controller = new ClubTrainersController(trainers as never, {} as never, {} as never, branchScope as never);
    const user = { sub: 77, branch: 3 } as never;

    await controller.list({ page: 1 } as never, user);
    await controller.statistics({} as never, user);
    await controller.allEarningPayments(user);

    expect(trainers.list).toHaveBeenCalledWith({ page: 1 }, [3], null);
    expect(trainers.statistics).toHaveBeenCalledWith([3], null);
    expect(trainers.listEarningPayments).toHaveBeenCalledWith(undefined, [3]);
  });
});
