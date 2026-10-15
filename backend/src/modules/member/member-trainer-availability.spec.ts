import { MemberService } from './member.service';

describe('member trainer availability and rating summary', () => {
  it('returns only reachable trainers with active weekly presence windows and rating', async () => {
    const prisma = {
      club_trainers: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            employee_id: null,
            name: 'أحمد',
            specialization: 'قوة',
            experience: '5',
            bio: null,
            image_url: null,
            rating_avg: 4.5,
          },
        ]),
      },
      club_classes: {
        findMany: jest.fn().mockResolvedValue([{ trainer_id: 9 }]),
      },
      club_class_schedule_slots: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainer_schedule_slots: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainer_availability: {
        findMany: jest.fn().mockResolvedValue([
          {
            trainer_id: 9,
            weekday: 2,
            start_time: '09:00:00',
            end_time: '13:00:00',
          },
        ]),
      },
    };
    const service = new MemberService(
      prisma as never,
      { get: () => '/uploads' } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.listTrainers(2)).resolves.toEqual([
      expect.objectContaining({
        id: 9,
        rating: 4.5,
        availability: [{ weekday: 2, startTime: '09:00:00', endTime: '13:00:00' }],
      }),
    ]);
    expect(prisma.club_trainer_availability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trainer_id: { in: [9] }, is_active: true },
      }),
    );
  });
});
