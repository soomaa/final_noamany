import { ClubTrainersService } from './club-trainers.service';

describe('trainer private attendance ratings', () => {
  it('stores one rating against the checked-out private attendance and recalculates the trainer average', async () => {
    const createdAt = new Date('2026-09-09T10:00:00Z');
    const tx = {
      club_trainer_ratings: {
        create: jest.fn().mockResolvedValue({
          id: 8,
          trainer_id: 16,
          member_id: 7,
          attendance_id: 99,
          rating: 5,
          comment: 'ممتاز',
          created_at: createdAt,
        }),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }),
      },
      club_trainers: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      club_attendance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 99,
          member_id: 7,
          status: 'checked_out',
          private_commission: { trainer_id: 16 },
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ClubTrainersService(prisma as never, {} as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 16 } as never);

    await expect(service.addRating(16, {
      attendanceId: 99,
      memberId: 7,
      rating: 5,
      comment: 'ممتاز',
    })).resolves.toEqual({
      id: 8,
      trainerId: 16,
      memberId: 7,
      attendanceId: 99,
      rating: 5,
      comment: 'ممتاز',
      ratingAvg: 4.5,
      createdAt,
    });

    expect(tx.club_trainer_ratings.create).toHaveBeenCalledWith({
      data: {
        trainer_id: 16,
        member_id: 7,
        attendance_id: 99,
        rating: 5,
        comment: 'ممتاز',
      },
    });
  });
});
