import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubClassTypesService } from './club-class-types.service';

const branchUser = { sub: 3, level: 2, branch: 2 } as never;

function makeService(existingSlots: Array<{ id: number; trainer_id: number; branch_id: number }> = []) {
  const tx = {
    club_class_types: { update: jest.fn() },
    club_class_type_trainers: { deleteMany: jest.fn(), createMany: jest.fn() },
    club_trainer_schedule_slots: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    club_class_types: {
      findFirst: jest.fn().mockResolvedValue({
        id: 4, name: 'Zumba', color: '#2563EB', default_duration_minutes: 60, single_session_price: 0,
        is_active: true, eligible_trainers: [], trainer_schedule_slots: [], _count: { sessions: 0, subscription_types: 0 },
      }),
      update: jest.fn(),
    },
    club_trainer_schedule_slots: { findMany: jest.fn().mockResolvedValue(existingSlots) },
    club_trainers: { count: jest.fn().mockImplementation(({ where }) => where.id.in.length) },
    tbl_branches: { count: jest.fn().mockImplementation(({ where }) => where.branch_id.in.length) },
    club_halls: { count: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const branchScope = {
    allowedBranchIds: jest.fn((user?: { level?: number; branch?: number }) =>
      !user || user.level === 1 ? null : [user.branch],
    ),
    isBranchAllowed: jest.fn((user: { level?: number; branch?: number } | undefined, id: number) =>
      !user || user.level === 1 || user.branch === id,
    ),
  };
  return { service: new ClubClassTypesService(prisma as never, branchScope as never), prisma, tx };
}

const body = (slots: Array<Record<string, unknown>>, trainerIds = [7]) => ({
  name: 'Zumba',
  eligibleTrainerIds: trainerIds,
  trainerSchedules: trainerIds.map((trainerId) => ({ trainerId, slots: slots.filter((s) => (s.trainerId ?? 7) === trainerId) })),
});

describe('class schedule audience and branch limits', () => {
  it('stores the audience of each weekly slot', async () => {
    const { service, tx } = makeService();
    await service.update(4, body([{ weekday: 1, startTime: '17:00', endTime: '18:00', branchId: 2, audience: 'women' }]), branchUser);

    expect(tx.club_trainer_schedule_slots.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ branch_id: 2, audience: 'women' })],
    });
  });

  it('rejects an unknown audience', async () => {
    const { service } = makeService();
    await expect(
      service.update(4, body([{ weekday: 1, startTime: '17:00', endTime: '18:00', branchId: 2, audience: 'teens' }]), branchUser),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a slot in another branch', async () => {
    const { service } = makeService();
    await expect(
      service.create(body([{ weekday: 1, startTime: '17:00', endTime: '18:00', branchId: 3 }]), branchUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps another branch\'s slots when a branch editor saves its own', async () => {
    const { service, tx } = makeService([{ id: 90, trainer_id: 8, branch_id: 3 }]);
    await service.update(
      4,
      body([{ trainerId: 7, weekday: 1, startTime: '17:00', endTime: '18:00', branchId: 2 }], [7, 8]),
      branchUser,
    );

    expect(tx.club_trainer_schedule_slots.deleteMany).toHaveBeenCalledWith({
      where: { class_type_id: 4, id: { notIn: [90] } },
    });
  });

  it('does not let a branch editor drop a trainer who teaches in another branch', async () => {
    const { service } = makeService([{ id: 90, trainer_id: 8, branch_id: 3 }]);
    await expect(
      service.update(4, body([{ trainerId: 7, weekday: 1, startTime: '17:00', endTime: '18:00', branchId: 2 }], [7]), branchUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
