import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder, assertNoOverlap } from '../../common/validators';
import { paginated } from '../../common/dto/list-result';
import { isActiveEnrollment, localDateString, toNum } from './club-fitness.utils';
import { ListClubTrainerSalariesDto, ListClubTrainersDto } from './dto/list-club-trainers.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';

@Injectable()
export class ClubTrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private mapTrainer(row: {
    id: number;
    employee_id: number | null;
    name: string;
    email: string | null;
    phone: string | null;
    specialization: string | null;
    experience: string | null;
    bio: string | null;
    image_url: string | null;
    rating_avg: Prisma.Decimal;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      specialization: row.specialization,
      experience: row.experience,
      bio: row.bio,
      imageUrl: row.image_url,
      ratingAvg: toNum(row.rating_avg),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSalary(row: {
    id: number;
    trainer_id: number;
    base_salary: Prisma.Decimal;
    class_commission_percentage: Prisma.Decimal;
    subscription_commission_percentage: Prisma.Decimal;
    effective_date: string;
    end_date: string | null;
    is_active: boolean;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    trainer?: { id: number; name: string; email: string | null; phone: string | null; specialization: string | null };
  }) {
    return {
      id: row.id,
      trainerId: row.trainer_id,
      baseSalary: toNum(row.base_salary),
      classCommissionPercentage: toNum(row.class_commission_percentage),
      subscriptionCommissionPercentage: toNum(row.subscription_commission_percentage),
      effectiveDate: row.effective_date,
      endDate: row.end_date,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trainer: row.trainer
        ? {
            id: row.trainer.id,
            name: row.trainer.name,
            email: row.trainer.email,
            phone: row.trainer.phone,
            specialization: row.trainer.specialization,
          }
        : undefined,
    };
  }

  async list(
    q: ListClubTrainersDto,
    branchIds: number[] | null = null,
    audience: 'male' | 'female' | null = null,
  ) {
    const and: Prisma.club_trainersWhereInput[] = [{ is_deleted: false }];
    const employeeIds = await this.employeeIdsForBranches(branchIds, audience);
    if (employeeIds) and.push({ employee_id: { in: employeeIds } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { name: { contains: s } },
          { email: { contains: s } },
          { phone: { contains: s } },
          { specialization: { contains: s } },
        ],
      });
    }
    if (q.isActive !== undefined) and.push({ is_active: q.isActive });

    const where: Prisma.club_trainersWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_trainers.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_trainers.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapTrainer(r)), total, q.page, q.pageSize);
  }

  async statistics(
    branchIds: number[] | null = null,
    audience: 'male' | 'female' | null = null,
  ) {
    const employeeIds = await this.employeeIdsForBranches(branchIds, audience);
    const scopeWhere: Prisma.club_trainersWhereInput = employeeIds ? { employee_id: { in: employeeIds } } : {};
    const [total, active] = await Promise.all([
      this.prisma.club_trainers.count({ where: { ...scopeWhere, is_deleted: false } }),
      this.prisma.club_trainers.count({ where: { ...scopeWhere, is_deleted: false, is_active: true } }),
    ]);
    return { total, active, inactive: total - active };
  }

  async findOne(id: number) {
    const row = await this.prisma.club_trainers.findFirst({
      where: { id, is_deleted: false },
    });
    if (!row) throw new NotFoundException('المدرب غير موجود');
    return this.mapTrainer(row);
  }

  async getDefaultSchedule(trainerId: number, classTypeId?: number) {
    await this.findOne(trainerId);
    if (!classTypeId) throw new BadRequestException('اختر الاشتراك الخاص أولًا');
    const rows = await this.prisma.club_trainer_schedule_slots.findMany({
      where: { trainer_id: trainerId, class_type_id: classTypeId, is_active: true },
      include: { hall: { select: { id: true, name: true, hall_number: true } } },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      classTypeId: row.class_type_id,
      trainerId: row.trainer_id,
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
      branchId: row.branch_id,
      hallId: row.hall_id,
      maxCapacity: row.max_capacity,
      hall: row.hall
        ? { id: row.hall.id, name: row.hall.name, hallNumber: row.hall.hall_number }
        : null,
    }));
  }

  async replaceDefaultSchedule(trainerId: number, body: { classTypeId?: number; slots?: Array<Record<string, unknown>> }) {
    await this.findOne(trainerId);
    const classTypeId = Number(body.classTypeId);
    if (!classTypeId) throw new BadRequestException('اختر الاشتراك الخاص أولًا');
    const classType = await this.prisma.club_class_types.findFirst({
      where: { id: classTypeId, is_deleted: false, is_active: true },
      include: { eligible_trainers: { select: { trainer_id: true } } },
    });
    if (!classType) throw new BadRequestException('الاشتراك الخاص غير موجود');
    if (!classType.eligible_trainers.some((row) => row.trainer_id === trainerId)) {
      throw new BadRequestException('المدرب غير مرتبط بهذا الاشتراك الخاص');
    }
    const slots = Array.isArray(body.slots) ? body.slots : [];
    const parsed = slots.map((slot) => {
      const weekday = Number(slot.weekday);
      const branchId = Number(slot.branchId);
      const hallId = slot.hallId ? Number(slot.hallId) : null;
      const startTime = String(slot.startTime ?? '');
      const endTime = String(slot.endTime ?? '');
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new BadRequestException('يوم الجدول الأسبوعي غير صالح');
      }
      if (!branchId || !startTime || !endTime) {
        throw new BadRequestException('اليوم والوقت والفرع مطلوبة لكل موعد');
      }
      if (endTime <= startTime) throw new BadRequestException('وقت النهاية يجب أن يكون بعد البداية');
      return {
        class_type_id: classTypeId,
        trainer_id: trainerId,
        weekday,
        start_time: startTime,
        end_time: endTime,
        branch_id: branchId,
        hall_id: hallId,
        max_capacity: Math.max(1, Number(slot.maxCapacity ?? 10)),
        is_active: true,
      };
    });

    const keys = new Set<string>();
    for (const slot of parsed) {
      const key = `${slot.weekday}:${slot.start_time}:${slot.branch_id}`;
      if (keys.has(key)) throw new BadRequestException('يوجد موعد مكرر في جدول المدرب');
      keys.add(key);
    }
    const hallIds = [...new Set(parsed.map((slot) => slot.hall_id).filter((id): id is number => id != null))];
    if (hallIds.length) {
      const count = await this.prisma.club_halls.count({ where: { id: { in: hallIds }, is_deleted: false } });
      if (count !== hallIds.length) throw new BadRequestException('توجد قاعة غير صالحة في الجدول');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_trainer_schedule_slots.deleteMany({ where: { trainer_id: trainerId, class_type_id: classTypeId } });
      if (parsed.length) await tx.club_trainer_schedule_slots.createMany({ data: parsed });
    });
    return this.getDefaultSchedule(trainerId, classTypeId);
  }

  async listEarningPayments(trainerId?: number, branchIds: number[] | null = null) {
    const employeeIds = await this.employeeIdsForBranches(branchIds);
    const rows = await this.prisma.club_trainer_earning_payments.findMany({
      where: {
        ...(trainerId ? { trainer_id: trainerId } : {}),
        ...(employeeIds ? { trainer: { employee_id: { in: employeeIds } } } : {}),
      },
      include: { trainer: { select: { id: true, name: true } } },
      orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      trainerId: row.trainer_id,
      trainer: row.trainer,
      amount: toNum(row.amount),
      paymentDate: row.payment_date,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  }

  private async employeeIdsForBranches(
    branchIds: number[] | null,
    audience: 'male' | 'female' | null = null,
  ) {
    if (branchIds === null && !audience) return null;
    if (branchIds !== null && !branchIds.length) return [];
    const employees = await this.prisma.employees.findMany({
      where: {
        ...(branchIds === null ? {} : { branch_id_fk: { in: branchIds } }),
        ...(audience ? { emp_type: audience === 'male' ? 1 : 2 } : {}),
      },
      select: { id: true },
    });
    return employees.map((employee) => employee.id);
  }

  async createEarningPayment(
    trainerId: number,
    body: { amount?: number; paymentDate?: string; periodFrom?: string; periodTo?: string; notes?: string },
    userId?: number,
  ) {
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true, name: true, employee_id: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('مبلغ الصرف غير صالح');
    const paymentDate = body.paymentDate || localDateString();
    if (!body.periodFrom || !body.periodTo) throw new BadRequestException('فترة الاستحقاق مطلوبة');
    assertDateOrder(body.periodFrom, body.periodTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const earnings = await this.earningsSummary(trainerId, body.periodFrom, body.periodTo);
    if (amount > earnings.remaining + 0.001) {
      throw new BadRequestException(`المبلغ أكبر من المستحق المتبقي (${earnings.remaining.toFixed(2)})`);
    }
    const employee = trainer.employee_id
      ? await this.prisma.employees.findUnique({
          where: { id: trainer.employee_id },
          select: { branch_id_fk: true },
        })
      : null;
    await this.moduleLedger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_trainers WHERE id = ${trainerId} FOR UPDATE`;
      const paidNow = await tx.club_trainer_earning_payments.aggregate({
        where: {
          trainer_id: trainerId,
          OR: [
            { period_from: body.periodFrom, period_to: body.periodTo },
            { period_from: null, period_to: null, payment_date: { gte: body.periodFrom, lte: body.periodTo } },
          ],
        },
        _sum: { amount: true },
      });
      const remainingNow = Math.max(0, earnings.earned - toNum(paidNow._sum.amount));
      if (amount > remainingNow + 0.001) {
        throw new BadRequestException(`المبلغ أكبر من المستحق المتبقي (${remainingNow.toFixed(2)})`);
      }
      const created = await tx.club_trainer_earning_payments.create({
        data: {
          trainer_id: trainerId,
          amount,
          payment_date: paymentDate,
          period_from: body.periodFrom,
          period_to: body.periodTo,
          notes: body.notes?.trim() || null,
          created_by: userId ?? null,
        },
      });
      await this.moduleLedger.postTrainerEarningPayment(
        {
          paymentId: created.id,
          branchId: employee?.branch_id_fk ?? undefined,
          date: paymentDate,
          amount,
          trainerName: trainer.name,
          createdBy: userId,
        },
        tx,
      );
      await recordSystemExpense(tx, {
        invoiceNumber: `TRPAY-${created.id}`,
        date: paymentDate,
        category: 'رواتب',
        subCategory: 'عمولات وأتعاب المدربين',
        amount,
        description: `صرف أتعاب المدرب ${trainer.name}`,
        vendor: trainer.name,
        branchId: employee?.branch_id_fk ?? undefined,
        createdBy: userId,
      });
      return created;
    });
    return {
      id: row.id,
      trainerId: row.trainer_id,
      amount: toNum(row.amount),
      paymentDate: row.payment_date,
      periodFrom: row.period_from,
      periodTo: row.period_to,
      notes: row.notes,
    };
  }

  async earningsSummary(trainerId: number, periodFrom: string, periodTo: string) {
    assertDateOrder(periodFrom, periodTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true, employee_id: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const [classes, receipts, privateCommissions, paid] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          trainer_id: trainerId,
          class_date: { gte: periodFrom, lte: periodTo },
          is_deleted: false,
          OR: [
            { status: 'completed' },
            { enrollments: { some: { attendance_status: 'attended' } } },
          ],
        },
        include: { enrollments: { where: { attendance_status: { not: 'cancelled' } } } },
      }),
      trainer.employee_id
        ? this.prisma.club_receipts.findMany({
            where: {
              receipt_date: { gte: periodFrom, lte: periodTo },
              status: { in: ['مدفوعة', 'paid'] },
              subscription: { is: { employee_id: trainer.employee_id } },
            },
            select: { amount: true, receipt_date: true },
          })
        : Promise.resolve([]),
      this.prisma.club_private_attendance_commissions.findMany({
        where: {
          trainer_id: trainerId,
          attendance_date: { gte: periodFrom, lte: periodTo },
        },
        select: { revenue_base: true, commission_amount: true },
      }),
      this.prisma.club_trainer_earning_payments.aggregate({
        where: {
          trainer_id: trainerId,
          OR: [
            { period_from: periodFrom, period_to: periodTo },
            { period_from: null, period_to: null, payment_date: { gte: periodFrom, lte: periodTo } },
          ],
        },
        _sum: { amount: true },
      }),
    ]);

    let classRevenue = 0;
    let classCommission = 0;
    for (const cls of classes) {
      const revenue = cls.enrollments.length * toNum(cls.price);
      classRevenue += revenue;
      const salary = await this.salaryForClassDate(trainerId, cls.class_date);
      classCommission += revenue * (toNum(salary?.class_commission_percentage) / 100);
    }
    let subscriptionRevenue = 0;
    let subscriptionCommission = 0;
    for (const receipt of receipts) {
      const amount = toNum(receipt.amount);
      subscriptionRevenue += amount;
      const salary = await this.salaryForClassDate(trainerId, receipt.receipt_date);
      subscriptionCommission += amount * (toNum(salary?.subscription_commission_percentage) / 100);
    }
    const privateRevenue = privateCommissions.reduce((sum, row) => sum + toNum(row.revenue_base), 0);
    const privateCommission = privateCommissions.reduce((sum, row) => sum + toNum(row.commission_amount), 0);
    subscriptionRevenue += privateRevenue;
    subscriptionCommission += privateCommission;
    const earned = Math.round((classCommission + subscriptionCommission) * 100) / 100;
    const paidAmount = toNum(paid._sum.amount);
    return {
      trainerId,
      periodFrom,
      periodTo,
      classRevenue,
      classCommission,
      subscriptionRevenue,
      subscriptionCommission,
      earned,
      paid: paidAmount,
      remaining: Math.max(0, Math.round((earned - paidAmount) * 100) / 100),
    };
  }

  private async salaryForClassDate(trainerId: number, classDate: string) {
    return this.prisma.club_trainer_salaries.findFirst({
      where: {
        trainer_id: trainerId,
        effective_date: { lte: classDate },
        OR: [{ end_date: null }, { end_date: { gte: classDate } }],
      },
      orderBy: { effective_date: 'desc' },
    });
  }

  private async recalculateRatingAvg(trainerId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const agg = await db.club_trainer_ratings.aggregate({
      where: { trainer_id: trainerId },
      _avg: { rating: true },
    });
    const avg = agg._avg.rating != null ? Number(agg._avg.rating) : 0;
    await db.club_trainers.update({
      where: { id: trainerId },
      data: { rating_avg: avg },
    });
    return avg;
  }

  async addRating(trainerId: number, body: Record<string, unknown>) {
    await this.findOne(trainerId);
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('التقييم يجب أن يكون رقمًا صحيحًا بين 1 و 5');
    }
    const attendanceId = Number(body.attendanceId);
    const memberId = Number(body.memberId);
    if (!Number.isInteger(attendanceId) || attendanceId <= 0 || !Number.isInteger(memberId) || memberId <= 0) {
      throw new BadRequestException('بيانات الحضور والعضو مطلوبة');
    }
    const attendance = await this.prisma.club_attendance.findUnique({
      where: { id: attendanceId },
      include: { private_commission: { select: { trainer_id: true } } },
    });
    if (!attendance) throw new NotFoundException('سجل الحضور غير موجود');
    if (attendance.status !== 'checked_out') throw new BadRequestException('يجب تسجيل خروج العضو أولاً');
    if (attendance.member_id !== memberId) throw new BadRequestException('بيانات العضو لا تطابق الحضور');
    if (attendance.private_commission?.trainer_id !== trainerId) throw new BadRequestException('الحضور غير مرتبط بهذا المدرب');
    const ratings = this.prisma.club_trainer_ratings as unknown as {
      findUnique(args: unknown): Promise<{ id: number } | null>;
    };
    if (await ratings.findUnique({ where: { attendance_id: attendanceId }, select: { id: true } })) {
      throw new ConflictException('تم تقييم هذه الحصة من قبل');
    }
    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const txRatings = tx.club_trainer_ratings as unknown as { create(args: unknown): Promise<{ id: number; trainer_id: number; attendance_id: number | null; member_id: number | null; rating: Prisma.Decimal; comment: string | null; created_at: Date }> };
        const created = await txRatings.create({
        data: {
          trainer_id: trainerId,
          attendance_id: attendanceId,
          member_id: memberId,
          rating,
          comment: body.comment ? String(body.comment).trim() || null : null,
        },
      });
      const avg = await this.recalculateRatingAvg(trainerId, tx);
      return { ...created, ratingAvg: avg };
    });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('تم تقييم هذه الحصة من قبل');
      }
      throw error;
    }
    return {
      id: row.id,
      trainerId: row.trainer_id,
      attendanceId: row.attendance_id,
      memberId: row.member_id,
      rating: toNum(row.rating),
      comment: row.comment,
      ratingAvg: row.ratingAvg,
      createdAt: row.created_at,
    };
  }

  async listRatings(trainerId: number) {
    await this.findOne(trainerId);
    const rows = await this.prisma.club_trainer_ratings.findMany({
      where: { trainer_id: trainerId },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      trainerId: r.trainer_id,
      memberId: r.member_id,
      rating: toNum(r.rating),
      comment: r.comment,
      createdAt: r.created_at,
    }));
  }

  /**
   * One manager-facing source of truth for a trainer profile. This intentionally reads existing
   * classes, immutable earnings and rating rows rather than introducing a second trainer ledger.
   */
  async workspace(
    id: number,
    query: { dateFrom?: string; dateTo?: string },
    access: { targets: boolean; earnings: boolean; ratings: boolean } = {
      targets: true,
      earnings: true,
      ratings: true,
    },
  ) {
    const today = localDateString();
    const dateFrom = query.dateFrom ?? `${today.slice(0, 7)}-01`;
    const dateTo = query.dateTo ?? today;
    assertDateOrder(dateFrom, dateTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const trainer = await this.findOne(id);
    const targetPeriod = access.targets ? await this.prisma.club_trainer_target_periods.findUnique({
      where: {
        trainer_id_period_month: {
          trainer_id: id,
          period_month: dateFrom.slice(0, 7),
        },
      },
    }) : null;
    const [details, earnings, payments, ratings] = await Promise.all([
      this.findDetails(id, { dateFrom, dateTo }),
      access.earnings ? this.earningsSummary(id, dateFrom, dateTo) : Promise.resolve(null),
      access.earnings ? this.listEarningPayments(id) : Promise.resolve([]),
      access.ratings ? this.listRatings(id) : Promise.resolve([]),
    ]);
    const settingNumber = (value: unknown) => {
      const parsed = Number(value ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const target = access.targets ? settingNumber(targetPeriod?.target_value) : null;
    const targetUnit = targetPeriod?.target_unit === 'money' ? 'money' : 'members';
    const revenue = earnings
      ? Math.round(((earnings as { revenue?: number }).revenue ?? (earnings.classRevenue + earnings.subscriptionRevenue)) * 100) / 100
      : null;
    const achieved = targetUnit === 'money' ? (revenue ?? 0) : details.statistics.uniqueMembers;
    const achievementPct = target != null && target > 0 ? Math.round((achieved / target) * 1000) / 10 : access.targets ? 0 : null;
    const ratingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>;
    for (const rating of ratings) {
      const key = String(Math.max(1, Math.min(5, Math.round(rating.rating)))) as keyof typeof ratingDistribution;
      ratingDistribution[key] += 1;
    }
    return {
      trainer: details.trainer,
      stats: {
        sessions: (earnings as { sessions?: number } | null)?.sessions ?? details.statistics.totalClasses,
        uniqueMembers: (earnings as { totalTrainees?: number } | null)?.totalTrainees ?? details.statistics.uniqueMembers,
        attendance: details.statistics.totalEnrollments, revenue, target, targetUnit, achievementPct,
        commissionPercent: access.earnings ? 0 : null,
        earned: earnings?.earned ?? null,
        paid: earnings?.paid ?? null,
        remaining: earnings?.remaining ?? null,
        overpaid: earnings ? (earnings as { overpaid?: number }).overpaid ?? 0 : null,
        ratingAvg: access.ratings ? details.trainer.ratingAvg : null,
        ratingCount: access.ratings ? ratings.length : null,
      },
      activeSalary: details.activeSalary,
      commissionSetting: targetPeriod ? {
        employeeId: trainer.employeeId,
        trainerId: id,
        targetUnit,
        baseTarget: target,
        periodMonth: targetPeriod.period_month,
        tiers: [],
      } : null,
      classes: details.classes, payments, ratings, ratingDistribution,
      access,
    };
  }

  async findDetails(id: number, query?: { dateFrom?: string; dateTo?: string }) {
    const trainer = await this.findOne(id);
    const classWhere: Prisma.club_classesWhereInput = {
      trainer_id: id,
      is_deleted: false,
    };
    if (query?.dateFrom && query?.dateTo) {
      classWhere.class_date = { gte: query.dateFrom, lte: query.dateTo };
    } else if (query?.dateFrom) {
      classWhere.class_date = { gte: query.dateFrom };
    } else if (query?.dateTo) {
      classWhere.class_date = { lte: query.dateTo };
    }

    const classes = await this.prisma.club_classes.findMany({
      where: classWhere,
      include: {
        enrollments: {
          where: { attendance_status: { not: 'cancelled' } },
        },
      },
      orderBy: [{ class_date: 'desc' }, { start_time: 'asc' }],
    });

    const activeSalary = await this.prisma.club_trainer_salaries.findFirst({
      where: { trainer_id: id, is_active: true },
      orderBy: { effective_date: 'desc' },
    });

    const totalClasses = classes.length;
    const uniqueDates = new Set(classes.map((c) => c.class_date));
    const uniqueMembers = new Set<number>();
    let totalEnrollments = 0;
    let totalClassRevenue = 0;
    let totalClassCommission = 0;

    for (const cls of classes) {
      const activeEnrollments = cls.enrollments.filter((e) => isActiveEnrollment(e.attendance_status));
      totalEnrollments += activeEnrollments.length;
      activeEnrollments.forEach((e) => uniqueMembers.add(e.member_id));
      const revenue = activeEnrollments.length * toNum(cls.price);
      totalClassRevenue += revenue;
      const salaryAtClass = await this.salaryForClassDate(id, cls.class_date);
      if (salaryAtClass) {
        totalClassCommission += revenue * (toNum(salaryAtClass.class_commission_percentage) / 100);
      }
    }

    return {
      trainer,
      activeSalary: activeSalary ? this.mapSalary(activeSalary) : null,
      statistics: {
        totalClasses,
        totalDays: uniqueDates.size,
        totalEnrollments,
        uniqueMembers: uniqueMembers.size,
        totalClassRevenue,
        totalClassCommission,
      },
      classes: classes.map((c) => ({
        id: c.id,
        className: c.class_name,
        classDate: c.class_date,
        startTime: c.start_time,
        endTime: c.end_time,
        status: c.status,
        price: toNum(c.price),
        maxCapacity: c.max_capacity,
        enrollmentCount: c.enrollments.filter((e) => isActiveEnrollment(e.attendance_status)).length,
      })),
    };
  }

  async create(body: Record<string, unknown>) {
    if (!body.name || !String(body.name).trim()) {
      throw new BadRequestException('اسم المدرب مطلوب');
    }
    const row = await this.prisma.club_trainers.create({
      data: {
        employee_id: body.employeeId != null ? Number(body.employeeId) : null,
        name: String(body.name).trim(),
        email: body.email ? String(body.email).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        specialization: body.specialization ? String(body.specialization).trim() : null,
        experience: body.experience ? String(body.experience).trim() : null,
        bio: body.bio ? String(body.bio) : null,
        image_url: body.imageUrl ? String(body.imageUrl) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.mapTrainer(row);
  }

  async createExternal(body: Record<string, unknown>) {
    const name = String(body.name ?? '').trim();
    if (!name) throw new BadRequestException('اسم الكابتن مطلوب');

    const commissionPercentage = Number(body.commissionPercentage ?? 0);
    if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
      throw new BadRequestException('نسبة الكابتن يجب أن تكون بين 0 و 100');
    }

    const classTypeId = body.classTypeId ? Number(body.classTypeId) : null;
    if (classTypeId) {
      const classType = await this.prisma.club_class_types.findFirst({
        where: { id: classTypeId, is_deleted: false, is_active: true },
        select: { id: true },
      });
      if (!classType) throw new BadRequestException('نوع الحصة غير موجود');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const trainer = await tx.club_trainers.create({
        data: {
          employee_id: null,
          name,
          phone: body.phone ? String(body.phone).trim() : null,
          specialization: body.specialization ? String(body.specialization).trim() : null,
          bio: 'كابتن خارجي للحصص الخاصة',
          is_active: true,
        },
      });
      await tx.club_trainer_salaries.create({
        data: {
          trainer_id: trainer.id,
          base_salary: 0,
          class_commission_percentage: commissionPercentage,
          subscription_commission_percentage: 0,
          effective_date: localDateString(),
          is_active: true,
          notes: 'نسبة كابتن خارجي للحصص الخاصة',
        },
      });
      if (classTypeId) {
        await tx.club_class_type_trainers.create({
          data: { class_type_id: classTypeId, trainer_id: trainer.id },
        });
      }
      return trainer;
    });

    return {
      ...this.mapTrainer(row),
      isExternal: true,
      commissionPercentage,
    };
  }

  async update(id: number, body: Record<string, unknown>) {
    await this.findOne(id);
    const row = await this.prisma.club_trainers.update({
      where: { id },
      data: {
        ...(body.employeeId !== undefined ? { employee_id: body.employeeId != null ? Number(body.employeeId) : null } : {}),
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ? String(body.phone).trim() : null } : {}),
        ...(body.specialization !== undefined ? { specialization: body.specialization ? String(body.specialization).trim() : null } : {}),
        ...(body.experience !== undefined ? { experience: body.experience ? String(body.experience).trim() : null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio ? String(body.bio) : null } : {}),
        ...(body.imageUrl !== undefined ? { image_url: body.imageUrl ? String(body.imageUrl) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.mapTrainer(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    const today = localDateString();
    await this.prisma.$transaction(async (tx) => {
      await tx.club_trainer_salaries.updateMany({
        where: { trainer_id: id, is_active: true },
        data: { is_active: false, end_date: today },
      });
      await tx.club_classes.updateMany({
        where: {
          trainer_id: id,
          is_deleted: false,
          status: 'scheduled',
          class_date: { gte: today },
        },
        data: { status: 'cancelled' },
      });
      await tx.club_trainers.update({
        where: { id },
        data: { is_deleted: true, is_active: false },
      });
    });
    return { success: true };
  }

  // --- Trainer salaries ---

  async listSalaries(q: ListClubTrainerSalariesDto) {
    const where: Prisma.club_trainer_salariesWhereInput = {};
    if (q.trainerId) where.trainer_id = q.trainerId;
    if (q.isActive !== undefined) where.is_active = q.isActive;

    const [rows, total] = await Promise.all([
      this.prisma.club_trainer_salaries.findMany({
        where,
        include: {
          trainer: {
            select: { id: true, name: true, email: true, phone: true, specialization: true },
          },
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_trainer_salaries.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapSalary(r)), total, q.page, q.pageSize);
  }

  async findSalary(id: number) {
    const row = await this.prisma.club_trainer_salaries.findUnique({
      where: { id },
      include: {
        trainer: {
          select: { id: true, name: true, email: true, phone: true, specialization: true },
        },
      },
    });
    if (!row) throw new NotFoundException('راتب المدرب غير موجود');
    return this.mapSalary(row);
  }

  async createSalary(body: Record<string, unknown>) {
    const trainerId = Number(body.trainerId);
    if (!trainerId) throw new BadRequestException('معرف المدرب مطلوب');
    if (body.baseSalary == null) throw new BadRequestException('الراتب الأساسي مطلوب');

    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const classPct = Number(body.classCommissionPercentage ?? 0);
    const subPct = Number(body.subscriptionCommissionPercentage ?? 0);
    if (classPct < 0 || classPct > 100) {
      throw new BadRequestException('نسبة عمولة الحصص يجب أن تكون بين 0 و 100');
    }
    if (subPct < 0 || subPct > 100) {
      throw new BadRequestException('نسبة عمولة الاشتراكات يجب أن تكون بين 0 و 100');
    }

    const isActive = body.isActive !== false;
    const effectiveDate = body.effectiveDate ? String(body.effectiveDate) : localDateString();
    const endDate = body.endDate ? String(body.endDate) : null;
    if (endDate) assertDateOrder(effectiveDate, endDate, 'تاريخ نهاية الراتب يجب أن يكون بعد تاريخ السريان');

    const existingSalaries = await this.prisma.club_trainer_salaries.findMany({
      where: { trainer_id: trainerId },
      select: { id: true, effective_date: true, end_date: true },
    });
    assertNoOverlap(
      { start: effectiveDate, end: endDate ?? '9999-12-31' },
      existingSalaries.map((s) => ({
        start: s.effective_date,
        end: s.end_date ?? '9999-12-31',
        id: s.id,
      })),
      'فترة الراتب تتداخل مع سجل موجود',
    );

    const row = await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.club_trainer_salaries.updateMany({
          where: { trainer_id: trainerId, is_active: true },
          data: { is_active: false, end_date: localDateString() },
        });
      }
      return tx.club_trainer_salaries.create({
        data: {
          trainer_id: trainerId,
          base_salary: Number(body.baseSalary),
          class_commission_percentage: classPct,
          subscription_commission_percentage: subPct,
          effective_date: effectiveDate,
          end_date: endDate,
          is_active: isActive,
          notes: body.notes ? String(body.notes) : null,
        },
        include: {
          trainer: {
            select: { id: true, name: true, email: true, phone: true, specialization: true },
          },
        },
      });
    });

    return this.mapSalary(row);
  }

  async updateSalary(id: number, body: Record<string, unknown>) {
    const existing = await this.findSalary(id);
    const classPct = body.classCommissionPercentage != null ? Number(body.classCommissionPercentage) : null;
    const subPct = body.subscriptionCommissionPercentage != null ? Number(body.subscriptionCommissionPercentage) : null;
    if (classPct != null && (classPct < 0 || classPct > 100)) {
      throw new BadRequestException('نسبة عمولة الحصص يجب أن تكون بين 0 و 100');
    }
    if (subPct != null && (subPct < 0 || subPct > 100)) {
      throw new BadRequestException('نسبة عمولة الاشتراكات يجب أن تكون بين 0 و 100');
    }

    const activating = body.isActive === true && !existing.isActive;
    const effectiveDate = body.effectiveDate != null ? String(body.effectiveDate) : existing.effectiveDate;
    const endDate = body.endDate !== undefined ? (body.endDate ? String(body.endDate) : null) : existing.endDate;
    if (endDate) assertDateOrder(effectiveDate, endDate, 'تاريخ نهاية الراتب يجب أن يكون بعد تاريخ السريان');

    const siblings = await this.prisma.club_trainer_salaries.findMany({
      where: { trainer_id: existing.trainerId, id: { not: id } },
      select: { id: true, effective_date: true, end_date: true },
    });
    assertNoOverlap(
      { start: effectiveDate, end: endDate ?? '9999-12-31', id },
      siblings.map((s) => ({
        start: s.effective_date,
        end: s.end_date ?? '9999-12-31',
        id: s.id,
      })),
      'فترة الراتب تتداخل مع سجل موجود',
    );

    const row = await this.prisma.$transaction(async (tx) => {
      if (activating) {
        await tx.club_trainer_salaries.updateMany({
          where: { trainer_id: existing.trainerId, is_active: true, id: { not: id } },
          data: { is_active: false, end_date: localDateString() },
        });
      }
      return tx.club_trainer_salaries.update({
        where: { id },
        data: {
          ...(body.baseSalary != null ? { base_salary: Number(body.baseSalary) } : {}),
          ...(classPct != null ? { class_commission_percentage: classPct } : {}),
          ...(subPct != null ? { subscription_commission_percentage: subPct } : {}),
          ...(body.effectiveDate != null ? { effective_date: String(body.effectiveDate) } : {}),
          ...(body.endDate !== undefined ? { end_date: body.endDate ? String(body.endDate) : null } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        },
        include: {
          trainer: {
            select: { id: true, name: true, email: true, phone: true, specialization: true },
          },
        },
      });
    });

    return this.mapSalary(row);
  }

  async removeSalary(id: number) {
    await this.findSalary(id);
    await this.prisma.club_trainer_salaries.delete({ where: { id } });
    return { success: true };
  }
}
