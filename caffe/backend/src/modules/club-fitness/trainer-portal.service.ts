import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { toNum } from './club-fitness.utils';

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class TrainerPortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownTrainer(user: JwtUser) {
    const trainer = user.trainer_id
      ? await this.prisma.club_trainers.findFirst({
          where: { id: user.trainer_id, is_active: true, is_deleted: false },
        })
      : user.emp_code
        ? await this.prisma.club_trainers.findFirst({
            where: { employee_id: user.emp_code, is_active: true, is_deleted: false },
          })
        : null;
    if (!trainer) throw new ForbiddenException('هذه البوابة متاحة للمدربين فقط');
    return trainer;
  }

  private classDateWhere(dateFrom?: string, dateTo?: string): Prisma.StringFilter | undefined {
    if (!dateFrom && !dateTo) return undefined;
    return { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
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

    return classes.map((cls) => ({
      id: cls.id,
      className: cls.class_name,
      classDate: cls.class_date,
      startTime: cls.start_time,
      endTime: cls.end_time,
      hall: cls.hall ? { name: cls.hall.name, hallNumber: cls.hall.hall_number } : null,
      status: cls.status,
      color: cls.class_type?.color ?? '#2563EB',
    }));
  }

  async dashboard(user: JwtUser, query?: { dateFrom?: string; dateTo?: string }) {
    const trainer = await this.ownTrainer(user);
    const classes = await this.prisma.club_classes.findMany({
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
    });

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
      const isExecuted =
        cls.status !== 'cancelled' && (cls.status === 'completed' || attended > 0);
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

    const paymentWhere: Prisma.club_trainer_earning_paymentsWhereInput = {
      trainer_id: trainer.id,
      ...(query?.dateFrom || query?.dateTo
        ? {
            payment_date: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
    };
    const [paidAgg, payments] = await Promise.all([
      this.prisma.club_trainer_earning_payments.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      this.prisma.club_trainer_earning_payments.findMany({
        where: paymentWhere,
        orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const paid = toNum(paidAgg._sum.amount);
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
        averageAttendance: classes.length ? totalAttendance / classes.length : 0,
        adherenceRate: eligibleForAdherence ? (executed / eligibleForAdherence) * 100 : 100,
        totalEarnings,
      },
      schedule: classes.map((cls) => ({
        id: cls.id,
        classTypeId: cls.class_type_id,
        className: cls.class_name,
        classDate: cls.class_date,
        startTime: cls.start_time,
        endTime: cls.end_time,
        hall: cls.hall
          ? { id: cls.hall.id, name: cls.hall.name, hallNumber: cls.hall.hall_number }
          : null,
        status: cls.status,
        color: cls.class_type?.color ?? '#2563EB',
      })),
      attendance,
      earnings: {
        total: totalEarnings,
        paid,
        remaining: roundMoney(Math.max(0, totalEarnings - paid)),
        items: earningItems,
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
