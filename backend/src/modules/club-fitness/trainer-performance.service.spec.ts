import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
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

  describe('trainer self-only visibility', () => {
    const scope = new BranchScopeService();
    const trainerUser = { sub: 30, level: 2, branch: 3, trainer_id: 9, is_trainer: true, man_women_type: 3 } as JwtUser;

    function makeDb() {
      return {
        club_trainers: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
        employees: { findMany: jest.fn().mockResolvedValue([{ id: 100 }]) },
      } as any;
    }

    it('lists only the logged-in trainer when they lack the trainers update permission', async () => {
      const db = makeDb();
      const permissions = { can: jest.fn().mockResolvedValue(false) };
      const service = new TrainerPerformanceService(db, scope, permissions as never);
      await service.listTrainers(trainerUser);
      expect(permissions.can).toHaveBeenCalledWith(30, 'club.fitness.trainers', 'update');
      expect(db.club_trainers.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: { in: [9] } }),
      }));
    });

    it('rejects another trainer profile or target for a self-only trainer', async () => {
      const service = new TrainerPerformanceService(makeDb(), scope, { can: jest.fn().mockResolvedValue(false) } as never);
      await expect(service.profile(10, '2026-10', trainerUser)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.saveTarget({ trainerId: 10, privateSalesTarget: 1 }, 30, trainerUser)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a trainer-manager see the trainers of their branches', async () => {
      const db = makeDb();
      db.club_trainers.findMany.mockResolvedValueOnce([{ id: 9 }, { id: 10 }]);
      const service = new TrainerPerformanceService(db, scope, { can: jest.fn().mockResolvedValue(true) } as never);
      await service.listTrainers(trainerUser);
      expect(db.employees.findMany).toHaveBeenCalledWith({ where: { branch_id_fk: { in: [3] } }, select: { id: true } });
      expect(db.club_trainers.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: { in: [9, 10] } }),
      }));
    });

    it('keeps system admins unrestricted', async () => {
      const db = makeDb();
      const service = new TrainerPerformanceService(db, scope, { can: jest.fn() } as never);
      await service.listTrainers({ ...trainerUser, level: 1 });
      expect(db.club_trainers.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { is_deleted: false, is_active: true },
      }));
    });

    it('falls back to level 3 = manager when the permission engine is unavailable', async () => {
      const service = new TrainerPerformanceService(makeDb(), scope);
      await expect(service.isTrainerSelfOnly(trainerUser)).resolves.toBe(true);
      await expect(service.isTrainerSelfOnly({ ...trainerUser, level: 3 })).resolves.toBe(false);
    });
  });
});

