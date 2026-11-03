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
import { localDateString, toNum } from './club-fitness.utils';
import { ListClubTrainerSalariesDto, ListClubTrainersDto } from './dto/list-club-trainers.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainerPerformanceService } from './trainer-performance.service';
import { trainerBranchMap } from './trainer-branches.util';
import {
  assertNoPayoutConflict,
  attendedCount,
  computeTrainerEarnings,
  overlappingPaymentsWhere,
  payoutPeriodConflicts,
} from './trainer-earnings.util';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const previousDay = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

@Injectable()
export class ClubTrainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly access: TrainerPerformanceService,
  ) {}

  /** Trainer ids the user may see (branch scope, or self-only trainers); null = all. */
  private visibleIds(user?: JwtUser) {
    return user ? this.access.visibleTrainerIds(user) : Promise.resolve(null);
  }

  private async assertAccess(user: JwtUser | undefined, trainerId: number) {
    if (user) await this.access.assertTrainerAccess(user, trainerId);
  }

  /** Branch a trainer's expense/ledger lines belong to: the employee's branch, or the only branch they work in. */
  private async payoutBranch(trainerId: number): Promise<number | undefined> {
    const branches = (await trainerBranchMap(this.prisma, [trainerId])).get(trainerId) ?? [];
    return branches.length === 1 ? branches[0] : undefined;
  }

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

  async list(q: ListClubTrainersDto, user?: JwtUser) {
    const and: Prisma.club_trainersWhereInput[] = [{ is_deleted: false }];
    const ids = await this.visibleIds(user);
    if (ids !== null) and.push({ id: { in: ids } });
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

  async statistics(user?: JwtUser) {
    const ids = await this.visibleIds(user);
    const scope = ids === null ? {} : { id: { in: ids } };
    const [total, active] = await Promise.all([
      this.prisma.club_trainers.count({ where: { is_deleted: false, ...scope } }),
      this.prisma.club_trainers.count({ where: { is_deleted: false, is_active: true, ...scope } }),
    ]);
    return { total, active, inactive: total - active };
  }

  async findOne(id: number, user?: JwtUser) {
    await this.assertAccess(user, id);
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

  async listEarningPayments(trainerId?: number, user?: JwtUser) {
    if (trainerId) await this.assertAccess(user, trainerId);
    const ids = trainerId ? null : await this.visibleIds(user);
    const rows = await this.prisma.club_trainer_earning_payments.findMany({
      where: trainerId ? { trainer_id: trainerId } : ids === null ? undefined : { trainer_id: { in: ids } },
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

  async createEarningPayment(
    trainerId: number,
    body: { amount?: number; paymentDate?: string; periodFrom?: string; periodTo?: string; notes?: string },
    userId?: number,
    user?: JwtUser,
  ) {
    await this.assertAccess(user, trainerId);
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true, name: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('مبلغ الصرف غير صالح');
    const paymentDate = body.paymentDate || localDateString();
    if (!DATE_RE.test(paymentDate)) throw new BadRequestException('تاريخ الصرف غير صالح');
    const periodFrom = body.periodFrom;
    const periodTo = body.periodTo;
    if (!periodFrom || !periodTo || !DATE_RE.test(periodFrom) || !DATE_RE.test(periodTo)) {
      throw new BadRequestException('فترة الاستحقاق مطلوبة');
    }
    assertDateOrder(periodFrom, periodTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const earnings = await computeTrainerEarnings(this.prisma, trainerId, periodFrom, periodTo);
    const branchId = await this.payoutBranch(trainerId);
    await this.moduleLedger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      // Serialises payouts per trainer so two cashiers cannot both pay the same remaining amount.
      await tx.$queryRaw`SELECT id FROM club_trainers WHERE id = ${trainerId} FOR UPDATE`;
      assertNoPayoutConflict(await payoutPeriodConflicts(tx, trainerId, periodFrom, periodTo));
      const paidNow = await tx.club_trainer_earning_payments.aggregate({
        where: overlappingPaymentsWhere(trainerId, periodFrom, periodTo),
        _sum: { amount: true },
      });
      const remainingNow = Math.max(0, Math.round((earnings.earned - toNum(paidNow._sum.amount)) * 100) / 100);
      if (amount > remainingNow + 0.001) {
        throw new BadRequestException(`المبلغ أكبر من المستحق المتبقي (${remainingNow.toFixed(2)})`);
      }
      const created = await tx.club_trainer_earning_payments.create({
        data: {
          trainer_id: trainerId,
          amount,
          payment_date: paymentDate,
          period_from: periodFrom,
          period_to: periodTo,
          notes: body.notes?.trim() || null,
          created_by: userId ?? null,
        },
      });
      await this.moduleLedger.postTrainerEarningPayment(
        {
          paymentId: created.id,
          branchId,
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
        branchId,
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

  /** Earned / paid / remaining for one payout period. Same calculation as the trainer portal. */
  async earningsSummary(trainerId: number, periodFrom: string, periodTo: string, user?: JwtUser) {
    if (!periodFrom || !periodTo || !DATE_RE.test(periodFrom) || !DATE_RE.test(periodTo)) {
      throw new BadRequestException('فترة الاستحقاق مطلوبة');
    }
    assertDateOrder(periodFrom, periodTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    await this.assertAccess(user, trainerId);
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const [earnings, paid, conflicts] = await Promise.all([
      computeTrainerEarnings(this.prisma, trainerId, periodFrom, periodTo),
      this.prisma.club_trainer_earning_payments.aggregate({
        where: overlappingPaymentsWhere(trainerId, periodFrom, periodTo),
        _sum: { amount: true },
      }),
      payoutPeriodConflicts(this.prisma, trainerId, periodFrom, periodTo),
    ]);
    const paidAmount = toNum(paid._sum.amount);
    return {
      trainerId,
      periodFrom,
      periodTo,
      classRevenue: earnings.classRevenue,
      classCommission: earnings.classCommission,
      privateRevenue: earnings.privateRevenue,
      privateCommission: earnings.privateCommission,
      // Kept for older clients: private sessions are the only "subscription" earnings now.
      subscriptionRevenue: earnings.privateRevenue,
      subscriptionCommission: earnings.privateCommission,
      earned: earnings.earned,
      paid: paidAmount,
      remaining: conflicts.length ? 0 : Math.max(0, Math.round((earnings.earned - paidAmount) * 100) / 100),
      conflicts,
    };
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
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('التقييم يجب أن يكون بين 1 و 5');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_trainer_ratings.create({
        data: {
          trainer_id: trainerId,
          member_id: body.memberId != null ? Number(body.memberId) : null,
          rating,
          comment: body.comment ? String(body.comment) : null,
        },
      });
      const avg = await this.recalculateRatingAvg(trainerId, tx);
      return { ...created, ratingAvg: avg };
    });
    return {
      id: row.id,
      trainerId: row.trainer_id,
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

  async findDetails(id: number, query?: { dateFrom?: string; dateTo?: string }, user?: JwtUser) {
    const trainer = await this.findOne(id, user);
    const dateFrom = query?.dateFrom && DATE_RE.test(query.dateFrom) ? query.dateFrom : undefined;
    const dateTo = query?.dateTo && DATE_RE.test(query.dateTo) ? query.dateTo : undefined;
    const classWhere: Prisma.club_classesWhereInput = {
      trainer_id: id,
      is_deleted: false,
      ...(dateFrom || dateTo
        ? { class_date: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
        : {}),
    };

    const [classes, activeSalary, earnings] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: classWhere,
        include: { enrollments: { where: { attendance_status: { not: 'cancelled' } } } },
        orderBy: [{ class_date: 'desc' }, { start_time: 'asc' }],
      }),
      this.prisma.club_trainer_salaries.findFirst({
        where: { trainer_id: id, is_active: true },
        orderBy: { effective_date: 'desc' },
      }),
      computeTrainerEarnings(this.prisma, id, dateFrom, dateTo),
    ]);

    const held = classes.filter((c) => c.status !== 'cancelled');
    const uniqueDates = new Set(held.map((c) => c.class_date));
    const uniqueMembers = new Set<number>();
    let totalRegistered = 0;
    let totalAttended = 0;
    for (const cls of held) {
      totalRegistered += cls.enrollments.length;
      for (const e of cls.enrollments) {
        if (e.attendance_status !== 'attended') continue;
        totalAttended += 1;
        uniqueMembers.add(e.member_id);
      }
    }
    for (const row of earnings.privateItems) if (row.memberId) uniqueMembers.add(row.memberId);

    return {
      trainer,
      activeSalary: activeSalary ? this.mapSalary(activeSalary) : null,
      statistics: {
        totalClasses: held.length,
        cancelledClasses: classes.length - held.length,
        totalDays: uniqueDates.size,
        // Registered = booked and not cancelled; only attended members count for revenue.
        totalEnrollments: totalRegistered,
        totalAttended,
        uniqueMembers: uniqueMembers.size,
        privateSessions: earnings.privateItems.length,
        totalClassRevenue: earnings.classRevenue,
        totalClassCommission: earnings.classCommission,
        privateRevenue: earnings.privateRevenue,
        privateCommission: earnings.privateCommission,
        earned: earnings.earned,
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
        enrollmentCount: c.enrollments.length,
        attendedCount: attendedCount(c),
      })),
    };
  }

  async create(body: Record<string, unknown>) {
    if (!body.name || !String(body.name).trim()) {
      throw new BadRequestException('اسم المدرب مطلوب');
    }
    const employeeId = this.parseEmployeeId(body.employeeId);
    await this.assertEmployeeFree(employeeId);
    const row = await this.prisma.club_trainers.create({
      data: {
        employee_id: employeeId,
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

  private parseEmployeeId(value: unknown): number | null {
    if (value == null || value === '' || Number(value) === 0) return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id < 0) throw new BadRequestException('الموظف غير صالح');
    return id;
  }

  private async assertEmployeeFree(employeeId: number | null, trainerId?: number) {
    if (employeeId == null) return;
    const [employee, other] = await Promise.all([
      this.prisma.employees.findUnique({ where: { id: employeeId }, select: { id: true } }),
      this.prisma.club_trainers.findFirst({ where: { employee_id: employeeId, ...(trainerId ? { id: { not: trainerId } } : {}) }, select: { id: true, name: true } }),
    ]);
    if (!employee) throw new BadRequestException('الموظف غير موجود');
    if (other) throw new ConflictException(`هذا الموظف مرتبط بالفعل بالمدرب ${other.name}`);
  }

  async update(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findOne(id, user);
    // `employeeId: null` (or '') removes the link; omitting the key leaves it unchanged.
    const employeeId = body.employeeId !== undefined ? this.parseEmployeeId(body.employeeId) : undefined;
    if (employeeId !== undefined) await this.assertEmployeeFree(employeeId, id);
    if (body.name !== undefined && !String(body.name ?? '').trim()) throw new BadRequestException('اسم المدرب مطلوب');
    const row = await this.prisma.club_trainers.update({
      where: { id },
      data: {
        ...(employeeId !== undefined ? { employee_id: employeeId } : {}),
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

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
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

  async listSalaries(q: ListClubTrainerSalariesDto, user?: JwtUser) {
    const where: Prisma.club_trainer_salariesWhereInput = {};
    const ids = await this.visibleIds(user);
    if (q.trainerId) {
      if (ids !== null && !ids.includes(q.trainerId)) return paginated([], 0, q.page, q.pageSize);
      where.trainer_id = q.trainerId;
    } else if (ids !== null) {
      where.trainer_id = { in: ids };
    }
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

  async findSalary(id: number, user?: JwtUser) {
    const row = await this.prisma.club_trainer_salaries.findUnique({
      where: { id },
      include: {
        trainer: {
          select: { id: true, name: true, email: true, phone: true, specialization: true },
        },
      },
    });
    if (!row) throw new NotFoundException('راتب المدرب غير موجود');
    await this.assertAccess(user, row.trainer_id);
    return this.mapSalary(row);
  }

  private parsePercentage(value: unknown, message: string): number {
    const pct = Number(value ?? 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new BadRequestException(message);
    return pct;
  }

  /**
   * A new compensation record starts on `effectiveDate`. The record open at that date is closed the
   * day before, so commission history stays correct for earlier classes and sessions. A record that
   * starts on the same date is updated in place instead of being duplicated.
   */
  async createSalary(body: Record<string, unknown>, user?: JwtUser) {
    const trainerId = Number(body.trainerId);
    if (!trainerId) throw new BadRequestException('معرف المدرب مطلوب');
    await this.assertAccess(user, trainerId);
    const baseSalary = Number(body.baseSalary ?? 0);
    if (!Number.isFinite(baseSalary) || baseSalary < 0) throw new BadRequestException('الراتب الأساسي غير صالح');

    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const classPct = this.parsePercentage(body.classCommissionPercentage, 'نسبة عمولة الحصص يجب أن تكون بين 0 و 100');
    const subPct = this.parsePercentage(body.subscriptionCommissionPercentage, 'نسبة البرايفت يجب أن تكون بين 0 و 100');

    const effectiveDate = body.effectiveDate ? String(body.effectiveDate) : localDateString();
    if (!DATE_RE.test(effectiveDate)) throw new BadRequestException('تاريخ السريان غير صالح');
    const endDate = body.endDate ? String(body.endDate) : null;
    if (endDate) assertDateOrder(effectiveDate, endDate, 'تاريخ نهاية الراتب يجب أن يكون بعد تاريخ السريان');
    const notes = body.notes ? String(body.notes) : null;
    const include = {
      trainer: { select: { id: true, name: true, email: true, phone: true, specialization: true } },
    } as const;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_trainers WHERE id = ${trainerId} FOR UPDATE`;
      const existing = await tx.club_trainer_salaries.findMany({
        where: { trainer_id: trainerId },
        select: { id: true, effective_date: true, end_date: true, monthly_target: true },
      });
      const sameDay = existing.find((s) => s.effective_date === effectiveDate);
      const others = existing.filter((s) => s.id !== sameDay?.id);
      // The record running at the new start date (open-ended or not) ends the day before.
      const running = others.find(
        (s) => s.effective_date < effectiveDate && (s.end_date == null || s.end_date >= effectiveDate),
      );
      if (running) {
        await tx.club_trainer_salaries.update({
          where: { id: running.id },
          data: { end_date: previousDay(effectiveDate), is_active: false },
        });
      }
      assertNoOverlap(
        { start: effectiveDate, end: endDate ?? '9999-12-31', id: sameDay?.id },
        others
          .filter((s) => s.id !== running?.id)
          .map((s) => ({ start: s.effective_date, end: s.end_date ?? '9999-12-31', id: s.id })),
        'فترة الراتب تتداخل مع سجل لاحق؛ عدّل السجل اللاحق أو اختر تاريخًا بعده',
      );
      // `is_active` marks the latest record (what the employee form edits); commission for a
      // given day always comes from the record whose dates cover that day.
      await tx.club_trainer_salaries.updateMany({
        where: { trainer_id: trainerId, is_active: true, ...(sameDay ? { id: { not: sameDay.id } } : {}) },
        data: { is_active: false },
      });
      const data = {
        base_salary: baseSalary,
        class_commission_percentage: classPct,
        subscription_commission_percentage: subPct,
        effective_date: effectiveDate,
        end_date: endDate,
        is_active: true,
        notes,
      };
      if (sameDay) return tx.club_trainer_salaries.update({ where: { id: sameDay.id }, data, include });
      return tx.club_trainer_salaries.create({
        data: { trainer_id: trainerId, ...data, monthly_target: running?.monthly_target ?? 0 },
        include,
      });
    });

    return this.mapSalary(row);
  }

  async updateSalary(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findSalary(id, user);
    const classPct = body.classCommissionPercentage != null
      ? this.parsePercentage(body.classCommissionPercentage, 'نسبة عمولة الحصص يجب أن تكون بين 0 و 100')
      : null;
    const subPct = body.subscriptionCommissionPercentage != null
      ? this.parsePercentage(body.subscriptionCommissionPercentage, 'نسبة البرايفت يجب أن تكون بين 0 و 100')
      : null;
    if (body.baseSalary != null && (!Number.isFinite(Number(body.baseSalary)) || Number(body.baseSalary) < 0)) {
      throw new BadRequestException('الراتب الأساسي غير صالح');
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
          data: { is_active: false },
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

  async removeSalary(id: number, user?: JwtUser) {
    await this.findSalary(id, user);
    await this.prisma.club_trainer_salaries.delete({ where: { id } });
    return { success: true };
  }
}
