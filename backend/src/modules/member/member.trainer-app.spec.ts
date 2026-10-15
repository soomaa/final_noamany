import { BadRequestException, NotFoundException } from '@nestjs/common';
import { computeAttendanceStreak, MemberService } from './member.service';

/**
 * Member-app trainer profile, ratings, weekly calendar and attendance streak.
 * Ratings follow the ONE80 design: the member's app rating is keyed on
 * `(trainer_id, app_member_id)`; per-attendance ratings (app_member_id NULL) are never touched.
 */
describe('MemberService — trainer profile, ratings, week and attendance', () => {
  const trainer = {
    id: 9, employee_id: null, name: 'أحمد', specialization: 'قوة، كارديو', experience: '5',
    bio: null, image_url: 'public-file:photo', rating_avg: 4.5, is_active: true, is_deleted: false,
  };
  const tx = {
    club_trainer_ratings: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    club_trainers: { update: jest.fn() },
  };
  const prisma = {
    club_trainers: { findFirst: jest.fn() },
    club_classes: { findMany: jest.fn() },
    club_class_schedule_slots: { findMany: jest.fn() },
    club_trainer_schedule_slots: { findMany: jest.fn() },
    employees: { findMany: jest.fn() },
    club_trainer_availability: { findMany: jest.fn() },
    club_trainer_ratings: { count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    club_members: { findMany: jest.fn() },
    club_attendance: { findMany: jest.fn() },
    club_class_types: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new MemberService(
    prisma as never,
    { get: () => '/uploads' } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_trainers.findFirst.mockResolvedValue(trainer);
    prisma.club_classes.findMany.mockResolvedValue([]);
    prisma.club_class_schedule_slots.findMany.mockResolvedValue([]);
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValue([{ trainer_id: 9 }]);
    prisma.employees.findMany.mockResolvedValue([]);
    prisma.club_trainer_availability.findMany.mockResolvedValue([]);
    prisma.club_trainer_ratings.count.mockResolvedValue(3);
    prisma.club_trainer_ratings.findFirst.mockResolvedValue(null);
    tx.club_trainer_ratings.aggregate.mockResolvedValue({ _avg: { rating: 4 } });
    tx.club_trainer_ratings.count.mockResolvedValue(4);
  });

  it('hides a trainer who does not work in the member branch', async () => {
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValue([]);
    await expect(service.getTrainer(2, 46, 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the profile with specializations, public photo URL and only the app rating as myRating', async () => {
    prisma.club_trainer_schedule_slots.findMany
      .mockResolvedValueOnce([{ trainer_id: 9 }])
      .mockResolvedValueOnce([
        { class_type_id: 3, weekday: 2, start_time: '19:00:00', end_time: '20:00:00', max_capacity: 10, audience: 'men', class_type: { id: 3, name: 'كروس فيت', color: '#111111' }, hall: null },
        { class_type_id: 3, weekday: 0, start_time: '19:00:00', end_time: '20:00:00', max_capacity: 10, audience: 'men', class_type: { id: 3, name: 'كروس فيت', color: '#111111' }, hall: null },
      ]);
    prisma.club_trainer_ratings.findFirst.mockResolvedValue({ rating: 5, comment: 'ممتاز', created_at: new Date(), updated_at: new Date() });

    const detail = await service.getTrainer(2, 46, 9);

    expect(prisma.club_trainer_ratings.findFirst).toHaveBeenCalledWith({ where: { trainer_id: 9, app_member_id: 46 } });
    expect(detail).toMatchObject({
      id: 9,
      specializations: ['قوة', 'كارديو'],
      imageUrl: '/api/uploads/public/photo',
      ratingsCount: 3,
      myRating: { rating: 5, comment: 'ممتاز' },
    });
    expect(detail.classes).toEqual([expect.objectContaining({ weekdays: [0, 2], dayNames: ['الأحد', 'الثلاثاء'], audienceLabel: 'رجال' })]);
  });

  it('never looks up a rating for a guest', async () => {
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValueOnce([{ trainer_id: 9 }]).mockResolvedValueOnce([]);
    const detail = await service.getTrainer(2, 0, 9);
    expect(prisma.club_trainer_ratings.findFirst).not.toHaveBeenCalled();
    expect(detail.myRating).toBeNull();
  });

  it('upserts the member app rating on (trainer, app_member) and sets both member columns', async () => {
    tx.club_trainer_ratings.upsert.mockResolvedValue({ rating: 4, comment: null, created_at: new Date(), updated_at: new Date() });

    const result = await service.rateTrainer(2, 46, 9, { rating: 4, comment: '   ' });

    expect(tx.club_trainer_ratings.upsert).toHaveBeenCalledWith({
      where: { trainer_id_app_member_id: { trainer_id: 9, app_member_id: 46 } },
      create: { trainer_id: 9, member_id: 46, app_member_id: 46, rating: 4, comment: null },
      update: { rating: 4, comment: null },
    });
    expect(tx.club_trainers.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { rating_avg: 4 } });
    expect(result).toMatchObject({ rating: 4, ratingsCount: 4, myRating: { rating: 4 } });
  });

  it('deletes only the member app rating, keeping per-attendance ratings', async () => {
    const result = await service.deleteTrainerRating(2, 46, 9);
    expect(tx.club_trainer_ratings.deleteMany).toHaveBeenCalledWith({ where: { trainer_id: 9, app_member_id: 46 } });
    expect(result).toEqual({ rating: 4, ratingsCount: 4, myRating: null });
  });

  it('summarises every rating row but exposes first names only on commented reviews', async () => {
    prisma.club_trainer_ratings.findMany.mockResolvedValue([
      { id: 1, member_id: 46, rating: 5, comment: 'رائع', created_at: new Date() },
      { id: 2, member_id: 47, rating: 3, comment: null, created_at: new Date() },
    ]);
    prisma.club_members.findMany.mockResolvedValue([{ id: 46, name: 'سارة محمد علي' }]);

    const reviews = await service.listTrainerReviews(2, 9);

    expect(reviews).toMatchObject({ total: 2, averageRating: 4, distribution: { '5': 1, '3': 1 } });
    expect(reviews.reviews).toEqual([expect.objectContaining({ id: 1, memberName: 'سارة' })]);
    expect(reviews.reviews[0]).not.toHaveProperty('memberId');
  });

  it('returns seven days merging real sessions with un-materialised weekly slots', async () => {
    prisma.club_classes.findMany.mockResolvedValue([
      {
        id: 50, class_type_id: 3, trainer_schedule_slot_id: 7, class_name: 'يوجا', class_date: '2026-09-27',
        start_time: '10:00:00', end_time: '11:00:00', trainer_id: 9, max_capacity: 2, price: 50, audience: 'women',
        status: 'scheduled', is_active: true, trainer: { id: 9, name: 'أحمد' }, hall: null, class_type: { color: '#222222' },
        enrollments: [{ member_id: 46 }, { member_id: 47 }],
      },
    ]);
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValue([
      { id: 7, class_type_id: 3, weekday: 0, start_time: '10:00:00', end_time: '11:00:00', trainer_id: 9, max_capacity: 2, audience: 'women', trainer: { id: 9, name: 'أحمد' }, hall: null, class_type: { id: 3, name: 'يوجا', color: '#222222', single_session_price: 50 } },
      { id: 8, class_type_id: 4, weekday: 1, start_time: '18:00:00', end_time: '19:00:00', trainer_id: 9, max_capacity: 5, audience: 'mixed', trainer: { id: 9, name: 'أحمد' }, hall: null, class_type: { id: 4, name: 'كارديو', color: '', single_session_price: 40 } },
    ]);

    const week = await service.getWeekClasses(2, 46, '2026-09-27');

    expect(week.days).toHaveLength(7);
    expect(week).toMatchObject({ start: '2026-09-27', end: '2026-10-03' });
    expect(week.days[0].sessions).toEqual([expect.objectContaining({ id: 50, isFull: true, isEnrolled: true, isVirtual: false })]);
    expect(week.days[1].sessions).toEqual([expect.objectContaining({ id: -1, className: 'كارديو', color: '#2563EB', isVirtual: true, price: 40 })]);
    await expect(service.getWeekClasses(2, 46, '2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('computes streaks from de-duplicated visit days', async () => {
    expect(computeAttendanceStreak(['2026-09-25', '2026-09-26', '2026-09-26', '2026-09-20'], '2026-09-27'))
      .toEqual({ currentStreak: 2, bestStreak: 2, lastVisitDate: '2026-09-26' });
    expect(computeAttendanceStreak(['2026-09-20'], '2026-09-27').currentStreak).toBe(0);
    expect(computeAttendanceStreak([], '2026-09-27')).toEqual({ currentStreak: 0, bestStreak: 0, lastVisitDate: null });

    prisma.club_attendance.findMany.mockResolvedValue([{ attendance_date: '2026-09-01' }, { attendance_date: '2026-09-01' }]);
    const result = await service.getAttendance(46, '2026-09-01', '2026-09-30');
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: 46, attendance_date: { gte: '2026-09-01', lte: '2026-09-30' } },
    }));
    expect(result).toMatchObject({ days: ['2026-09-01'], totalVisits: 1 });
    await expect(service.getAttendance(46, '2026-09-30', '2026-09-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a class-type schedule that has no live slot in the branch', async () => {
    prisma.club_class_types.findFirst.mockResolvedValue(null);
    await expect(service.getClassTypeSchedule(2, 3)).rejects.toBeInstanceOf(NotFoundException);
  });
});
