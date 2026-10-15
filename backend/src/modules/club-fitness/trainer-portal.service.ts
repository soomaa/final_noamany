import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { toNum } from './club-fitness.utils';
import { ClubAttendanceService } from '../club-members/club-attendance.service';
import { localDateString } from '../club-members/club-member.utils';
import { ClubTrainersService } from './club-trainers.service';
import { trainerPaymentPeriodWhere } from './trainer-earnings';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class TrainerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly attendance?: ClubAttendanceService,
    @Optional() private readonly trainers?: ClubTrainersService,
  ) {}

  private validDateRange(dateFrom?: string, dateTo?: string) {
    if (
      !dateFrom ||
      !dateTo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ||
      dateFrom > dateTo
    ) {
      return null;
    }
    return { dateFrom, dateTo };
  }

  private datesInRange(dateFrom: string, dateTo: string) {
    const dates: Array<{ value: string; weekday: number }> = [];
    const cursor = new Date(`${dateFrom}T12:00:00Z`);
    const end = new Date(`${dateTo}T12:00:00Z`);
    // Portal requests are monthly. Keep a defensive ceiling for malformed/overly broad clients.
    for (let count = 0; cursor <= end && count < 370; count += 1) {
      dates.push({
        value: cursor.toISOString().slice(0, 10),
        weekday: cursor.getUTCDay(),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  private async ownTrainer(user: JwtUser) {
    const trainer = user.trainer_id
      ? await this.prisma.club_trainers.findFirst({
          where: { id: user.trainer_id, is_active: true, is_deleted: false },
        })
      : user.emp_code
        ? await this.prisma.club_trainers.findFirst({
            where: {
              employee_id: user.emp_code,
              is_active: true,
              is_deleted: false,
            },
          })
        : null;
    if (!trainer) throw new ForbiddenException('هذه البوابة متاحة للمدربين فقط');
    return trainer;
  }

  private classDateWhere(dateFrom?: string, dateTo?: string): Prisma.StringFilter | undefined {
    if (!dateFrom && !dateTo) return undefined;
    return {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  private async salaryForDate(trainerId: number, classDate: string) {
    return this.prisma.club_trainer_salaries.findFirst({
      where: {
        trainer_id: trainerId,
        effective_date: { lte: classDate },
        OR: [{ end_date: null }, { end_date: { gte: classDate } }],
      },
      orderBy: { effective_date: 'desc' },
    });
  }

  async schedule(user: JwtUser, query?: { dateFrom?: string; dateTo?: string }) {
    const trainer = await this.ownTrainer(user);
    const range = this.validDateRange(query?.dateFrom, query?.dateTo);
    const classes = await this.prisma.club_classes.findMany({
      where: {
        trainer_id: trainer.id,
        is_deleted: false,
        ...(this.classDateWhere(query?.dateFrom, query?.dateTo)
          ? { class_date: this.classDateWhere(query?.dateFrom, query?.dateTo) }
          : {}),
      },
      select: {
        id: true,
        class_type_id: true,
        trainer_schedule_slot_id: true,
        class_name: true,
        class_date: true,
        start_time: true,
        end_time: true,
        status: true,
        hall: { select: { name: true, hall_number: true } },
        class_type: { select: { color: true } },
      },
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
    });
    const weeklySlots = range
      ? await this.prisma.club_trainer_schedule_slots.findMany({
          where: { trainer_id: trainer.id, is_active: true },
          select: {
            id: true,
            class_type_id: true,
            weekday: true,
            start_time: true,
            end_time: true,
            hall: { select: { name: true, hall_number: true } },
            class_type: {
              select: {
                name: true,
                color: true,
                is_active: true,
                is_deleted: true,
              },
            },
          },
          orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
        })
      : [];

    const actual = classes.map((cls) => ({
      id: cls.id,
      className: cls.class_name,
      classDate: cls.class_date,
      startTime: cls.start_time,
      endTime: cls.end_time,
      hall: cls.hall ? { name: cls.hall.name, hallNumber: cls.hall.hall_number } : null,
      status: cls.status,
      color: cls.class_type?.color ?? '#2563EB',
    }));
    if (!range) return actual;

    // A saved weekly trainer slot is a real commitment even before management presses
    // "generate week". Show it in the trainer portal, but never duplicate a materialized
    // (including cancelled/rescheduled) session.
    const materialized = new Set(
      classes.flatMap((cls) => [
        cls.trainer_schedule_slot_id ? `slot:${cls.trainer_schedule_slot_id}:${cls.class_date}` : '',
        `class:${cls.class_type_id}:${cls.class_date}:${cls.start_time}`,
      ]),
    );
    let virtualId = -1;
    const virtual = this.datesInRange(range.dateFrom, range.dateTo).flatMap((date) =>
      weeklySlots
        .filter(
          (slot) =>
            slot.weekday === date.weekday &&
            slot.class_type.is_active &&
            !slot.class_type.is_deleted &&
            !materialized.has(`slot:${slot.id}:${date.value}`) &&
            !materialized.has(`class:${slot.class_type_id}:${date.value}:${slot.start_time}`),
        )
        .map((slot) => ({
          id: virtualId--,
          className: slot.class_type.name,
          classDate: date.value,
          startTime: slot.start_time,
          endTime: slot.end_time,
          hall: slot.hall ? { name: slot.hall.name, hallNumber: slot.hall.hall_number } : null,
          status: 'scheduled' as const,
          color: slot.class_type.color ?? '#2563EB',
        })),
    );

    return [...actual, ...virtual].sort(
      (a, b) => a.classDate.localeCompare(b.classDate) || a.startTime.localeCompare(b.startTime),
    );
  }

  async privateClients(user: JwtUser, today = localDateString()) {
    const trainer = await this.ownTrainer(user);
    const rows = await this.prisma.club_subscriptions.findMany({
      where: {
        private_trainer_id: trainer.id,
        member_id: { not: null },
        status: 'active',
        subscription_start_date: { lte: today },
        subscription_end_date: { gte: today },
      },
      include: {
        member: { select: { id: true, member_code: true, name: true, phone: true } },
        private_package: { select: { name: true } },
      },
      orderBy: [{ subscription_end_date: 'asc' }, { id: 'asc' }],
    });
    if (!rows.length) return [];
    const attended = await this.prisma.club_attendance.findMany({
      where: { subscription_id: { in: rows.map((row) => row.id) }, attendance_date: today },
      select: { subscription_id: true, status: true },
    });
    const checkedBySubscription = new Set(attended.filter((row) => row.status === 'checked_in').map((row) => row.subscription_id));
    return rows.flatMap((row) => row.member ? [{
      id: row.id,
      memberId: row.member.id,
      memberCode: row.member.member_code,
      memberName: row.member.name,
      phone: row.member.phone,
      packageName: row.private_package?.name ?? row.subscription_type ?? 'Private',
      endDate: row.subscription_end_date,
      status: row.status,
      sessionsRemaining: row.is_linked_to_sessions && row.sessions_count != null ? Math.max(0, row.sessions_count - row.sessions_used) : null,
      checkedInToday: checkedBySubscription.has(row.id),
    }] : []);
  }

  async privateCheckIn(user: JwtUser, subscriptionId: number) {
    const trainer = await this.ownTrainer(user);
    const today = localDateString();
    const subscription = await this.prisma.club_subscriptions.findFirst({
      where: {
        id: subscriptionId,
        private_trainer_id: trainer.id,
        member_id: { not: null },
        status: 'active',
        subscription_start_date: { lte: today },
        subscription_end_date: { gte: today },
      },
      select: { id: true, member_id: true, branch_id: true },
    });
    if (!subscription?.member_id) throw new BadRequestException('اشتراك التدريب الخاص غير متاح لهذا المدرب');
    if (!this.attendance) throw new BadRequestException('خدمة الحضور غير متاحة');
    return this.attendance.checkIn({
      memberId: subscription.member_id,
      branchId: subscription.branch_id,
      subscriptionId: subscription.id,
      consumeSession: true,
      notes: 'تسجيل من بوابة المدرب',
    }, user);
  }

  async dashboard(user: JwtUser, query?: { dateFrom?: string; dateTo?: string }) {
    const trainer = await this.ownTrainer(user);
    const [classes, privateCommissions] = await Promise.all([
      this.prisma.club_classes.findMany({
      where: {
        trainer_id: trainer.id,
        is_deleted: false,
        ...(this.classDateWhere(query?.dateFrom, query?.dateTo)
          ? { class_date: this.classDateWhere(query?.dateFrom, query?.dateTo) }
          : {}),
      },
      include: {
        hall: { select: { id: true, name: true, hall_number: true } },
        class_type: { select: { id: true, name: true, color: true } },
        enrollments: true,
      },
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.club_private_attendance_commissions.findMany({
        where: {
          trainer_id: trainer.id,
          ...(query?.dateFrom || query?.dateTo
            ? {
                attendance_date: {
                  ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                  ...(query.dateTo ? { lte: query.dateTo } : {}),
                },
              }
            : {}),
        },
        include: {
          attendance: { select: { member_id: true, member_name: true } },
          subscription: { select: { subscription_number: true, subscription_type: true } },
        },
        orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }],
      }),
    ]);

    let totalEarnings = 0;
    let totalAttendance = 0;
    let totalAbsent = 0;
    const memberIds = new Set<number>();
    const attendance: Array<{
      classId: number;
      className: string;
      classDate: string;
      attended: number;
      absent: number;
      registered: number;
      attendanceRate: number;
    }> = [];
    const earningItems: Array<{
      classId: number;
      className: string;
      classDate: string;
      attended: number;
      unitPrice: number;
      commissionPercentage: number;
      revenue: number;
      amount: number;
    }> = [];
    const executedClassIds = new Set<number>();
    for (const cls of classes) {
      const active = cls.enrollments.filter((row) => row.attendance_status !== 'cancelled');
      const attended = active.filter((row) => row.attendance_status === 'attended').length;
      const absent = active.filter((row) => row.attendance_status === 'absent').length;
      totalAttendance += attended;
      totalAbsent += absent;
      active.forEach((row) => memberIds.add(row.member_id));

      // Reception can record attendance while a class is still scheduled/ongoing.
      // Once real attendance exists, the class is considered executed for the
      // trainer's statistics and commission, without waiting for the status cron.
      const isExecuted = cls.status !== 'cancelled' && (cls.status === 'completed' || attended > 0);
      if (isExecuted) {
        executedClassIds.add(cls.id);
        const salary = await this.salaryForDate(trainer.id, cls.class_date);
        const unitPrice = toNum(cls.price);
        const commissionPercentage = toNum(salary?.class_commission_percentage);
        const revenue = roundMoney(attended * unitPrice);
        const amount = roundMoney(revenue * (commissionPercentage / 100));
        totalEarnings = roundMoney(totalEarnings + amount);
        earningItems.push({
          classId: cls.id,
          className: cls.class_name,
          classDate: cls.class_date,
          attended,
          unitPrice,
          commissionPercentage,
          revenue,
          amount,
        });
      }
      attendance.push({
        classId: cls.id,
        className: cls.class_name,
        classDate: cls.class_date,
        attended,
        absent,
        registered: active.length,
        attendanceRate: active.length ? (attended / active.length) * 100 : 0,
      });
    }

    privateCommissions.forEach((row) => memberIds.add(row.attendance.member_id));
    const privateEarnings = roundMoney(
      privateCommissions.reduce((sum, row) => sum + Math.max(0, toNum(row.commission_amount) - toNum(row.refunded_amount)), 0),
    );
    totalEarnings = roundMoney(totalEarnings + privateEarnings);

    const paymentWhere: Prisma.club_trainer_earning_paymentsWhereInput = query?.dateFrom && query.dateTo
      ? trainerPaymentPeriodWhere(trainer.id, query.dateFrom, query.dateTo)
      : { trainer_id: trainer.id };
    const [paidAgg, payments, canonicalEarnings] = await Promise.all([
      this.prisma.club_trainer_earning_payments.aggregate({
        where: paymentWhere,
        _sum: { amount: true },
      }),
      this.prisma.club_trainer_earning_payments.findMany({
        where: paymentWhere,
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
      }),
      this.trainers && query?.dateFrom && query.dateTo
        ? this.trainers.earningsSummary(trainer.id, query.dateFrom, query.dateTo)
        : Promise.resolve(null),
    ]);
    const paid = canonicalEarnings?.paid ?? toNum(paidAgg._sum.amount);
    const payableTotal = canonicalEarnings?.earned ?? totalEarnings;
    const executed = executedClassIds.size;
    const cancelled = classes.filter((row) => row.status === 'cancelled').length;
    const eligibleForAdherence = executed + cancelled;

    return {
      trainer: {
        id: trainer.id,
        name: trainer.name,
        specialization: trainer.specialization,
        imageUrl: trainer.image_url,
      },
      statistics: {
        scheduledClasses: classes.length,
        completedClasses: executed,
        totalTrainees: memberIds.size,
        totalAttendance,
        privateSessions: privateCommissions.length,
        averageAttendance: classes.length ? totalAttendance / classes.length : 0,
        adherenceRate: eligibleForAdherence ? (executed / eligibleForAdherence) * 100 : 100,
        totalEarnings: payableTotal,
      },
      schedule: classes.map((cls) => ({
        id: cls.id,
        classTypeId: cls.class_type_id,
        className: cls.class_name,
        classDate: cls.class_date,
        startTime: cls.start_time,
        endTime: cls.end_time,
        hall: cls.hall
          ? {
              id: cls.hall.id,
              name: cls.hall.name,
              hallNumber: cls.hall.hall_number,
            }
          : null,
        status: cls.status,
        color: cls.class_type?.color ?? '#2563EB',
      })),
      attendance,
      earnings: {
        total: payableTotal,
        paid,
        remaining: canonicalEarnings?.remaining ?? roundMoney(Math.max(0, payableTotal - paid)),
        overpaid: canonicalEarnings?.overpaid ?? roundMoney(Math.max(0, paid - payableTotal)),
        commissionMode: canonicalEarnings?.commissionMode ?? 'attendance',
        items: earningItems,
        privateItems: privateCommissions.map((row) => ({
          id: row.id,
          attendanceId: row.attendance_id,
          subscriptionId: row.subscription_id,
          subscriptionNumber: row.subscription.subscription_number,
          subscriptionType: row.subscription.subscription_type,
          memberId: row.attendance.member_id,
          memberName: row.attendance.member_name,
          attendanceDate: row.attendance_date,
          sequence: row.commission_sequence,
          revenue: toNum(row.revenue_base),
          commissionPercentage: toNum(row.commission_percentage),
          amount: Math.max(0, toNum(row.commission_amount) - toNum(row.refunded_amount)),
          refundedAmount: toNum(row.refunded_amount),
        })),
        payments: payments.map((row) => ({
          id: row.id,
          amount: toNum(row.amount),
          paymentDate: row.payment_date,
          notes: row.notes,
        })),
      },
      totals: { attended: totalAttendance, absent: totalAbsent },
    };
  }
}
