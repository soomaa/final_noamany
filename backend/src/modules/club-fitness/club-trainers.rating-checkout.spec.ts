import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClubTrainersService } from './club-trainers.service';

describe('checkout-backed trainer ratings', () => {
  const trainer = { id: 9, employee_id: 90, name: 'كابتن أحمد', email: null, phone: null, specialization: null, experience: null, bio: null, image_url: null, rating_avg: 0, is_active: true, is_deleted: false, created_at: new Date(), updated_at: new Date() };
  function harness(attendance: Record<string, unknown> | null = { id: 44, member_id: 7, status: 'checked_out', private_commission: { trainer_id: 9 } }, existing: object | null = null) {
    const tx = { club_trainer_ratings: { create: jest.fn().mockResolvedValue({ id: 31, trainer_id: 9, attendance_id: 44, member_id: 7, rating: 5, comment: 'ممتاز', created_at: new Date() }), aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.5 } }) }, club_trainers: { update: jest.fn() } };
    const prisma = { club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) }, club_attendance: { findUnique: jest.fn().mockResolvedValue(attendance) }, club_trainer_ratings: { findUnique: jest.fn().mockResolvedValue(existing) }, $transaction: jest.fn((fn) => fn(tx)) };
    return { service: new ClubTrainersService(prisma as never, {} as never), tx };
  }

  it('rates only the matching checked-out private attendance', async () => {
    const { service, tx } = harness();
    await expect(service.addRating(9, { attendanceId: 44, memberId: 7, rating: 5, comment: 'ممتاز' })).resolves.toMatchObject({ attendanceId: 44, memberId: 7, rating: 5 });
    expect(tx.club_trainer_ratings.create).toHaveBeenCalledWith({ data: { trainer_id: 9, attendance_id: 44, member_id: 7, rating: 5, comment: 'ممتاز' } });
  });

  it('refuses a duplicate attendance rating rather than duplicating the trainer average', async () => {
    const { service } = harness(undefined, { id: 20 });
    await expect(service.addRating(9, { attendanceId: 44, memberId: 7, rating: 4 })).rejects.toEqual(new ConflictException('تم تقييم هذه الحصة من قبل'));
  });

  it('refuses a rating before check-out', async () => {
    const { service } = harness({ id: 44, member_id: 7, status: 'checked_in', private_commission: { trainer_id: 9 } });
    await expect(service.addRating(9, { attendanceId: 44, memberId: 7, rating: 5 })).rejects.toEqual(new BadRequestException('يجب تسجيل خروج العضو أولاً'));
  });
});
