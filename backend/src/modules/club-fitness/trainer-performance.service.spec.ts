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
        employees: { findMany: jest.fn().mockResolvedValue([{ id: 100, branch_id_fk: 3 }]) },
        club_trainer_schedule_slots: { groupBy: jest.fn().mockResolvedValue([]) },
        club_classes: { groupBy: jest.fn().mockResolvedValue([]) },
        club_subscriptions: { groupBy: jest.fn().mockResolvedValue([]) },
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

    it('lets a trainer-manager see the trainers of their branches, including unlinked ones', async () => {
      const db = makeDb();
      // 9: employee of branch 3; 10: unlinked, teaches in branch 3; 11: unlinked, branch 5 only;
      // 12: unlinked with no branch evidence yet (no classes, so nothing to pay).
      db.club_trainers.findMany.mockResolvedValueOnce([
        { id: 9, employee_id: 100 },
        { id: 10, employee_id: null },
        { id: 11, employee_id: null },
        { id: 12, employee_id: null },
      ]);
      db.club_classes.groupBy.mockResolvedValue([{ trainer_id: 10, branch_id: 3 }]);
      db.club_subscriptions.groupBy.mockResolvedValue([{ private_trainer_id: 11, branch_id: 5 }]);
      const service = new TrainerPerformanceService(db, scope, { can: jest.fn().mockResolvedValue(true) } as never);
      await expect(service.visibleTrainerIds(trainerUser)).resolves.toEqual([9, 10, 12]);
    });

    it('files an unlinked trainer\'s evaluation under the one branch they work in', async () => {
      const db = makeDb();
      const manager = { sub: 31, level: 3, branch: 3, trainer_id: null, is_trainer: false, man_women_type: 3 } as unknown as JwtUser;
      db.club_trainers.findMany.mockResolvedValue([{ id: 10, employee_id: null }]);
      db.club_trainers.findFirst.mockResolvedValue({ id: 10, employee_id: null });
      db.club_classes.groupBy.mockResolvedValue([{ trainer_id: 10, branch_id: 3 }]);
      db.club_trainer_evaluation_criteria = { findMany: jest.fn().mockResolvedValue([{ id: 1, title: 'التزام', max_score: 10 }]) };
      const tx = {
        club_trainer_evaluations: { upsert: jest.fn().mockResolvedValue({ id: 77 }) },
        club_trainer_evaluation_items: { deleteMany: jest.fn(), createMany: jest.fn() },
      };
      db.$transaction = jest.fn((fn: (t: unknown) => unknown) => fn(tx));
      const service = new TrainerPerformanceService(db, scope);
      await service.saveEvaluation({ trainerId: 10, month: '2026-10', items: [{ criterionId: 1, score: 8 }] }, manager);
      expect(tx.club_trainer_evaluations.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ branch_id: 3, total_score: 8, max_score: 10 }),
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

