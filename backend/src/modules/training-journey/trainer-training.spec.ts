import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainerTrainingGuard } from './trainer-training.guard';
import { TrainingService } from './training.service';
import { TrainingAdminController, TrainerTrainingController } from './training.controller';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';

const coach = {sub: 21, level: 2, branch: 10, employeeId: 100, emp_code: 100, is_trainer: true, trainer_id: 7} as JwtUser;
const scope = {isBranchAllowed: (_u: JwtUser, branch: number) => branch === 10, allowedBranchIds: () => [10]} as unknown as BranchScopeService;
const exercise = {key: 'custom:mine', name: 'Press', kind: 'strength', primary: ['chest'], secondary: ['triceps'], instructions: ''};
function fixture() {
  const db = { club_equipment:{findMany:jest.fn().mockResolvedValue([])},
    club_trainers: {findFirst: jest.fn().mockResolvedValue({id: 7})},
    club_members: {findFirst: jest.fn().mockResolvedValue({id: 1, branch_id: 10}), findMany: jest.fn().mockResolvedValue([])},
    training_assignments: {findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([])},
    club_subscriptions: {findMany: jest.fn().mockResolvedValue([])},
    training_exercise_profiles: {findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), upsert: jest.fn()},
    club_exercises: {findMany: jest.fn().mockResolvedValue([])}, am_exercises: {findMany: jest.fn().mockResolvedValue([])},
    training_plans: {findMany: jest.fn().mockResolvedValue([])},
  };
  return {db, service: new TrainingService(db as unknown as PrismaService, scope)};
}
function context(user: JwtUser) {
  const req = {user};
  return {req, execution: {switchToHttp: () => ({getRequest: () => req})} as ExecutionContext};
}
describe('Trainer training identity and authorization', () => {
  it('checks the active trainer against the canonical employee FK and confines manager-coaches to self in their portal', async () => {
    const {db} = fixture();
    const guard = new TrainerTrainingGuard(db as unknown as PrismaService);
    const c = context({...coach, level: 1});
    expect(await guard.canActivate(c.execution)).toBe(true);
    expect(db.club_trainers.findFirst).toHaveBeenCalledWith({where: {id: 7, employee_id: 100, is_active: true, is_deleted: false}, select: {id: true}});
    expect(c.req.user.level).toBe(2);
    expect(c.req.user.sub).toBe(21);
  });
  it.each([{...coach, is_trainer: false}, {...coach, trainer_id: null}, {...coach, employeeId: null, emp_code: null}])('rejects an unlinked account', async user => {
    const {db} = fixture();
    await expect(new TrainerTrainingGuard(db as unknown as PrismaService).canActivate(context(user).execution)).rejects.toThrow();
  });
  it('rejects an inactive, deleted or mismatched roster row', async () => {
    const {db} = fixture();db.club_trainers.findFirst.mockResolvedValue(null);
    await expect(new TrainerTrainingGuard(db as unknown as PrismaService).canActivate(context(coach).execution)).rejects.toThrow();
  });
  it('keeps portal permission separate from administration for every action', () => {
    for (const name of Object.getOwnPropertyNames(TrainerTrainingController.prototype).filter(k => k !== 'constructor')) {
      const fn = (TrainerTrainingController.prototype as any)[name];
      expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, fn) ?? Reflect.getMetadata(REQUIRES_PERMISSION_KEY, TrainerTrainingController)).toEqual(['trainer.portal:view']);
    }
    expect(Reflect.getMetadata(REQUIRES_PERMISSION_KEY, TrainingAdminController.prototype.plan)).toEqual(['club.fitness.programs:create']);
  });
  it('allows the assigned coach and denies another coach even when an older purchase link exists', async () => {
    const {db, service} = fixture();db.training_assignments.findFirst.mockResolvedValue({trainer_id: 7});
    await expect(service.assertAccess(1, coach)).resolves.toMatchObject({id: 1});
    await expect(service.assertAccess(1, {...coach, trainer_id: 8})).rejects.toThrow('العضو غير مسند');
    expect(db.club_subscriptions.findMany).not.toHaveBeenCalled();
  });
  it('denies out-of-branch members and permits scoped administration without a personal link', async () => {
    const {db, service} = fixture();db.club_members.findFirst.mockResolvedValue({id: 1, branch_id: 20});
    await expect(service.assertAccess(1, coach)).rejects.toThrow('نطاق');
    db.club_members.findFirst.mockResolvedValue({id: 1, branch_id: 10});
    await expect(service.assertAccess(1, {...coach, is_trainer: false, level: 3})).resolves.toMatchObject({id: 1});
  });
  it('uses current paid subscriptions and roster links when no training plan exists', async () => {
    const {db, service} = fixture();
    db.club_subscriptions.findMany.mockResolvedValue([{member_id: 1}]);
    await expect(service.assertAccess(1, coach)).resolves.toMatchObject({id: 1});
    expect(db.club_subscriptions.findMany.mock.calls[0][0].where).toMatchObject({private_trainer_id: 7, status: 'active', subscription_start_date: {lte: expect.any(String)}, subscription_end_date: {gte: expect.any(String)}});
    db.club_subscriptions.findMany.mockResolvedValue([]);
    db.club_members.findMany.mockResolvedValue([{id: 1}]);
    await expect(service.assertAccess(1, coach)).resolves.toMatchObject({id: 1});
    db.club_members.findMany.mockResolvedValue([]);
    await expect(service.assertAccess(1, coach)).rejects.toThrow('العضو غير مسند');
  });
  it('excludes handovers from the old coach list and selects only safe member identifiers within the branch', async () => {
    const {db, service} = fixture();
    db.training_assignments.findMany.mockResolvedValueOnce([{member_id: 1}, {member_id: 2}]).mockResolvedValueOnce([{member_id: 2}]);
    db.club_members.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{id: 1, name: 'Member', member_code: 'S1', branch_id: 10}]);
    expect(await service.trainerMembers(coach, 'Member')).toEqual([{id: 1, name: 'Member', memberCode: 'S1', branchId: 10}]);
    expect(db.club_members.findMany.mock.calls[1][0]).toMatchObject({where: {id: {in: [1]}, branch_id: {in: [10]}, is_deleted: false}, select: {id: true, name: true, member_code: true, branch_id: true}});
  });
  it('lists own drafts and approved branch programs; managers retain management scope', async () => {
    const {db, service} = fixture();await service.plans(coach);
    expect(db.training_plans.findMany.mock.calls[0][0].where).toEqual({branch_id: {in: [10]}, OR: [{created_by: 21}, {status: 'published'}]});
    await service.plans({...coach, level: 3});
    expect(db.training_plans.findMany.mock.calls[1][0].where).toEqual({branch_id: {in: [10]}});
  });
  it('rejects coach publication even from a direct request', async () => {
    const {service} = fixture();await expect(service.savePlan({branchId: 10, status: 'published'}, coach)).rejects.toThrow('للإدارة فقط');
  });
  it('prevents changing club defaults or another coach custom exercise', async () => {
    const {db, service} = fixture();jest.spyOn(service, 'catalog').mockResolvedValue({muscles: [], exercises: [{...exercise, videoUrl: null}]} as any);
    db.training_exercise_profiles.findUnique.mockResolvedValue({created_by: 99, updated_by: 21});
    await expect(service.saveExercise(exercise, coach)).rejects.toThrow('تمارينك الخاصة');
    expect(db.training_exercise_profiles.upsert).not.toHaveBeenCalled();
  });
  it('keeps exercise ownership after administration edits it', async () => {
    const {db, service} = fixture();jest.spyOn(service, 'catalog').mockResolvedValue({muscles: [], exercises: [{...exercise, videoUrl: null}]} as any);
    db.training_exercise_profiles.findUnique.mockResolvedValue({created_by: 21, updated_by: 1});
    await service.saveExercise(exercise, coach);
    const payload = db.training_exercise_profiles.upsert.mock.calls[0][0];
    expect(payload.create.created_by).toBe(21);
    expect(payload.update.created_by).toBeUndefined();
  });
  it('forces a coach assignment to their own native trainer ID despite a forged target', async () => {
    const {service} = fixture();
    jest.spyOn(service, 'assertAccess').mockResolvedValue({id: 1, name: 'Member', branch_id: 10});
    const tx = { $queryRaw: jest.fn(), training_assignments: {findFirst: jest.fn().mockResolvedValue({trainer_id: 7}), updateMany: jest.fn(), create: jest.fn().mockResolvedValue({id: 100})}, training_events: {create: jest.fn()} };
    const db = (service as any).db;
    db.training_plans.findUnique = jest.fn().mockResolvedValue({id: 1, branch_id: 10, status: 'published', days: [], revision: 2, name: 'Club plan', weeks: 8});
    db.club_trainers.findFirst.mockResolvedValue({employee_id: 100, name: 'Coach'});
    db.employees = {findUnique: jest.fn().mockResolvedValue({branch_id_fk: 10})};
    db.$transaction = jest.fn(fn => fn(tx));
    await service.assign(1, {planId: 1, trainerId: 99, startDate: '2026-10-08'}, coach);
    expect(tx.training_assignments.create.mock.calls[0][0].data).toMatchObject({trainer_id: 7, plan_revision: 2, member_id: 1});
    tx.training_assignments.findFirst.mockResolvedValue({trainer_id: 8});
    await expect(service.assign(1, {planId: 1, startDate: '2026-10-08'}, coach)).rejects.toThrow('العضو غير مسند');
    expect(tx.training_assignments.create).toHaveBeenCalledTimes(1);
  });
  it('catalog editing permissions follow immutable ownership rather than the last editor', async () => {
    const {db, service} = fixture();
    db.training_exercise_profiles.findMany.mockResolvedValue([
      {key: 'custom:mine', name: 'Press', kind: 'strength', primary_muscles: ['chest'], secondary_muscles: [], created_by: 21, updated_by: 1},
      {key: 'custom:other', name: 'Row', kind: 'strength', primary_muscles: ['lats'], secondary_muscles: [], created_by: 99, updated_by: 21},
    ]);
    expect((await service.catalog(coach)).exercises.map(e => [e.key, e.editable])).toEqual([['custom:mine', true], ['custom:other', false]]);
  });

});
