import { MemberService } from './member.service';

describe('MemberService branch trainers', () => {
  it('returns only trainers attached to the JWT branch through a class, schedule, or home employee branch', async () => {
    const trainers = [
      { id: 1, employee_id: 11, name: 'مدرب حصة', specialization: 'قوة', experience: '5', bio: null, image_url: null, rating_avg: 4.5 },
      { id: 2, employee_id: null, name: 'مدرب جدول', specialization: 'لياقة', experience: null, bio: null, image_url: null, rating_avg: 4 },
      { id: 3, employee_id: 33, name: 'مدرب الفرع', specialization: null, experience: null, bio: null, image_url: null, rating_avg: 0 },
      { id: 4, employee_id: 44, name: 'مدرب فرع آخر', specialization: null, experience: null, bio: null, image_url: null, rating_avg: 5 },
    ];
    const prisma = {
      club_trainers: { findMany: jest.fn().mockResolvedValue(trainers) },
      club_classes: { findMany: jest.fn().mockResolvedValue([{ trainer_id: 1 }]) },
      club_class_schedule_slots: { findMany: jest.fn().mockResolvedValue([{ trainer_id: 2 }]) },
      club_trainer_schedule_slots: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 33 }]) },
    };
    const service = new MemberService(prisma as any, {} as any, {} as any);

    const result = await (service as any).listTrainers(2);

    expect(result.map((trainer: { id: number }) => trainer.id)).toEqual([1, 2, 3]);
    expect(result.every((trainer: { branchId: number }) => trainer.branchId === 2)).toBe(true);
    expect(prisma.club_classes.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: 2 }),
    }));
    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id_fk: 2 }),
    }));
  });
});
