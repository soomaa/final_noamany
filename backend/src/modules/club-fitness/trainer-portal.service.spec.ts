import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainerPortalService } from './trainer-portal.service';

describe('TrainerPortalService', () => {
  const trainer = {
    id: 16,
    name: 'fatma',
    specialization: null,
    image_url: null,
  };
  const user: JwtUser = {
    sub: 1,
    level: 2,
    emp_code: 2,
    branch: 1,
    branch_name: 'فرع A1',
    man_women_type: 0,
    name: 'fatma',
    image: null,
    job_title: 'مدرب',
    is_trainer: true,
    trainer_id: trainer.id,
  };

  it('returns the trainer calendar rows with times, room, status, and class color', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_classes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 31,
            class_type_id: 4,
            trainer_schedule_slot_id: 9,
            class_name: 'يوجا',
            class_date: '2026-07-18',
            start_time: '17:00:00',
            end_time: '18:00:00',
            status: 'scheduled',
            hall: { name: 'قاعة اللياقة', hall_number: 'B2' },
            class_type: { color: '#8B5CF6' },
          },
        ]),
      },
      club_trainer_schedule_slots: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TrainerPortalService(prisma as unknown as PrismaService);

    const result = await service.schedule(user, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });

    expect(prisma.club_classes.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trainer_id: trainer.id,
          class_date: { gte: '2026-07-01', lte: '2026-07-31' },
        }),
      }),
    );
    expect(result).toEqual([
      {
        id: 31,
        className: 'يوجا',
        classDate: '2026-07-18',
        startTime: '17:00:00',
        endTime: '18:00:00',
        hall: { name: 'قاعة اللياقة', hallNumber: 'B2' },
        status: 'scheduled',
        color: '#8B5CF6',
      },
    ]);
  });

  it('shows saved weekly trainer slots even before dated sessions are generated', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_classes: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainer_schedule_slots: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            class_type_id: 4,
            weekday: 3,
            start_time: '17:00:00',
            end_time: '18:00:00',
            hall: { name: 'قاعة اللياقة', hall_number: 'B2' },
            class_type: {
              name: 'يوجا',
              color: '#8B5CF6',
              is_active: true,
              is_deleted: false,
            },
          },
        ]),
      },
    };
    const service = new TrainerPortalService(prisma as unknown as PrismaService);

    const result = await service.schedule(user, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-07',
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: -1,
        className: 'يوجا',
        classDate: '2026-07-01',
        startTime: '17:00:00',
        status: 'scheduled',
      }),
    ]);
  });

  it('does not duplicate a weekly slot after its dated session exists', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_classes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 31,
            class_type_id: 4,
            trainer_schedule_slot_id: 9,
            class_name: 'يوجا',
            class_date: '2026-07-01',
            start_time: '17:00:00',
            end_time: '18:00:00',
            status: 'scheduled',
            hall: null,
            class_type: { color: '#8B5CF6' },
          },
        ]),
      },
      club_trainer_schedule_slots: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            class_type_id: 4,
            weekday: 3,
            start_time: '17:00:00',
            end_time: '18:00:00',
            hall: null,
            class_type: {
              name: 'يوجا',
              color: '#8B5CF6',
              is_active: true,
              is_deleted: false,
            },
          },
        ]),
      },
    };
    const service = new TrainerPortalService(prisma as unknown as PrismaService);

    const result = await service.schedule(user, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(31);
  });

  it('calculates commission from real attendance before the status cron completes the class', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_classes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 23,
            class_type_id: 4,
            class_name: 'test',
            class_date: '2026-07-15',
            start_time: '08:00:00',
            end_time: '18:00:00',
            status: 'scheduled',
            price: 20,
            hall: null,
            class_type: { id: 4, name: 'test', color: '#2563EB' },
            enrollments: [
              {
                member_id: 12,
                attendance_status: 'attended',
              },
            ],
          },
        ]),
      },
      club_trainer_salaries: {
        findFirst: jest.fn().mockResolvedValue({ class_commission_percentage: 15 }),
      },
      club_trainer_earning_payments: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      club_private_attendance_commissions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TrainerPortalService(prisma as unknown as PrismaService);

    const result = await service.dashboard(user, {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-15',
    });

    expect(result.statistics.completedClasses).toBe(1);
    expect(result.statistics.totalEarnings).toBe(3);
    expect(result.earnings).toMatchObject({ total: 3, paid: 0, remaining: 3 });
    expect(result.earnings.items).toEqual([
      expect.objectContaining({
        classId: 23,
        attended: 1,
        unitPrice: 20,
        commissionPercentage: 15,
        revenue: 20,
        amount: 3,
      }),
    ]);
  });

  it('never calculates commission for a cancelled class even if stale attendance exists', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue(trainer) },
      club_classes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 24,
            class_type_id: 4,
            class_name: 'test',
            class_date: '2026-07-15',
            start_time: '08:00:00',
            end_time: '09:00:00',
            status: 'cancelled',
            price: 20,
            hall: null,
            class_type: { id: 4, name: 'test', color: '#2563EB' },
            enrollments: [{ member_id: 12, attendance_status: 'attended' }],
          },
        ]),
      },
      club_trainer_salaries: { findFirst: jest.fn() },
      club_trainer_earning_payments: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      club_private_attendance_commissions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TrainerPortalService(prisma as unknown as PrismaService);

    const result = await service.dashboard(user);

    expect(result.statistics.completedClasses).toBe(0);
    expect(result.earnings.total).toBe(0);
    expect(result.earnings.items).toEqual([]);
    expect(prisma.club_trainer_salaries.findFirst).not.toHaveBeenCalled();
  });
});
