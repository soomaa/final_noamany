import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubClassAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder, assertNoOverlap } from '../../common/validators';
import { paginated } from '../../common/dto/list-result';
import {
  isActiveEnrollment,
  joinSpecializations,
  localDateString,
  normalizeTimeOfDay,
  recalculateTrainerRatingAvg,
  splitSpecializations,
  timeOverlap,
  toNum,
} from './club-fitness.utils';
import { ListClubTrainerSalariesDto, ListClubTrainersDto, ListTrainerPerformanceDto } from './dto/list-club-trainers.dto';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';
import { effectiveTarget, resolveTargetCycle } from '../club-sales/target-period';
import { pickCommissionTier, roundMoney } from '../club-sales/club-sales.constants';
import { assertPrivateAttendanceRating } from './private-attendance-rating';
import { packageSessionValue } from './class-attendance-value';
import {
  assertTrainerPaymentPeriod,
  calculateTrainerEarnings,
  type TrainerCommissionMode,
} from './trainer-earnings';
import {
  settleTrainerReceiptSources,
  trainerReceiptSource,
  type TrainerReceiptSource,
} from './trainer-receipt-commissions';

/** Accepts `#RRGGBB` (any case); anything else clears the colour back to the derived fallback. */
function hexColor(value: unknown): string | null {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    throw new BadRequestException('لون المدرب يجب أن يكون بصيغة #RRGGBB');
  }
  return raw.toUpperCase();
}

/**
 * `club_trainers.image_url` is VarChar(255) and is rendered by the member app, so it must be a
 * public media reference (`public-file:<id>`, from the `trainers` upload category) or an
 * absolute URL. A private `file:` reference would never load for a member, so it is refused.
 */
function trainerImageInput(value: unknown): string | null {
  const url = value == null ? '' : String(value).trim();
  if (!url) return null;
  if (url.length > 255) throw new BadRequestException('رابط صورة المدرب أطول من المسموح');
  if (url.startsWith('file:')) {
    throw new BadRequestException('صورة المدرب يجب أن تُرفع كصورة عامة للتطبيق');
  }
  return url;
}

/**
 * `specializations: string[]` is the list-shaped input; `specialization` stays the raw
 * VarChar(200) for existing callers. When both arrive the list wins because it is the newer
 * shape the admin forms send. `undefined` means "field absent" so `update` leaves it alone.
 */
function trainerSpecializationInput(body: Record<string, unknown>): string | null | undefined {
  if (body.specializations !== undefined) return joinSpecializations(body.specializations);
  if (body.specialization !== undefined) {
    return body.specialization ? String(body.specialization).trim() : null;
  }
  return undefined;
}

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
    color?: string | null;
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
      specializations: splitSpecializations(row.specialization),
      color: row.color ?? null,
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

  async list(q: ListClubTrainersDto) {
    const and: Prisma.club_trainersWhereInput[] = [{ is_deleted: false }];
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

  async statistics() {
    const [total, active] = await Promise.all([
      this.prisma.club_trainers.count({ where: { is_deleted: false } }),
      this.prisma.club_trainers.count({ where: { is_deleted: false, is_active: true } }),
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

  async getAvailability(trainerId: number) {
    await this.findOne(trainerId);
    const rows = await this.prisma.club_trainer_availability.findMany({
      where: { trainer_id: trainerId },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, trainerId: row.trainer_id, weekday: row.weekday, startTime: row.start_time, endTime: row.end_time, isActive: row.is_active }));
  }

  async replaceAvailability(trainerId: number, body: { slots?: Array<Record<string, unknown>> }) {
    await this.findOne(trainerId);
    const slots = Array.isArray(body?.slots) ? body.slots : [];
    const parsed = slots.map((slot) => {
      const weekday = Number(slot.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new BadRequestException('يوم التواجد غير صالح');
      if (slot.startTime == null || slot.startTime === '' || slot.endTime == null || slot.endTime === '') throw new BadRequestException('وقت البداية والنهاية مطلوبان لكل يوم تواجد');
      const startTime = normalizeTimeOfDay(slot.startTime);
      const endTime = normalizeTimeOfDay(slot.endTime);
      if (endTime <= startTime) throw new BadRequestException('وقت النهاية يجب أن يكون بعد البداية');
      return { trainer_id: trainerId, weekday, start_time: startTime, end_time: endTime, is_active: slot.isActive === undefined ? true : Boolean(slot.isActive) };
    });
    const byDay = new Map<number, Array<{ start_time: string; end_time: string }>>();
    for (const slot of parsed) {
      const sameDay = byDay.get(slot.weekday) ?? [];
      if (sameDay.some((other) => timeOverlap(slot.start_time, slot.end_time, other.start_time, other.end_time))) throw new BadRequestException('يوجد تداخل في مواعيد تواجد المدرب');
      sameDay.push(slot);
      byDay.set(slot.weekday, sameDay);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.club_trainer_availability.deleteMany({ where: { trainer_id: trainerId } });
      if (parsed.length) await tx.club_trainer_availability.createMany({ data: parsed });
    });
    return this.getAvailability(trainerId);
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
      audience: row.audience,
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
      const audience = String(slot.audience ?? 'mixed') as ClubClassAudience;
      if (!Object.values(ClubClassAudience).includes(audience)) {
        throw new BadRequestException('تصنيف الحصة يجب أن يكون رجال أو سيدات أو أطفال أو مختلط');
      }
      return {
        class_type_id: classTypeId,
        trainer_id: trainerId,
        weekday,
        start_time: startTime,
        end_time: endTime,
        branch_id: branchId,
        hall_id: hallId,
        max_capacity: Math.max(1, Number(slot.maxCapacity ?? 10)),
        audience,
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

  async listEarningPayments(trainerId?: number) {
    const rows = await this.prisma.club_trainer_earning_payments.findMany({
      where: trainerId ? { trainer_id: trainerId } : undefined,
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
      await assertTrainerPaymentPeriod(tx, trainerId, body.periodFrom!, body.periodTo!);
      const current = await this.earningsSummary(trainerId, body.periodFrom!, body.periodTo!, tx);
      if (amount > current.remaining + 0.001) {
        throw new BadRequestException(`المبلغ أكبر من المستحق المتبقي (${current.remaining.toFixed(2)})`);
      }
      await settleTrainerReceiptSources(tx, current.receiptSources);
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

  async earningsSummary(
    trainerId: number,
    periodFrom: string,
    periodTo: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    assertDateOrder(periodFrom, periodTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const trainer = await db.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
      select: { id: true, employee_id: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const receiptSnapshots = await db.club_trainer_receipt_commissions.findMany({
      where: { trainer_id: trainerId },
    });

    const [classes, receipts, privateCommissions, paid, setting, refundCommissions] = await Promise.all([
      db.club_classes.findMany({
        where: {
          trainer_id: trainerId,
          class_date: { gte: periodFrom, lte: periodTo },
          is_deleted: false,
          status: { not: 'cancelled' },
        },
        include: { enrollments: { where: { attendance_status: { not: 'cancelled' } } } },
      }),
      trainer.employee_id || receiptSnapshots.length
        ? db.club_receipts.findMany({
            where: {
              receipt_date: { gte: periodFrom, lte: periodTo },
              status: { in: ['مدفوعة', 'paid'] },
              OR: [
                ...(trainer.employee_id
                  ? [{ subscription: { is: { employee_id: trainer.employee_id } } }]
                  : []),
                ...(receiptSnapshots.length
                  ? [{ id: { in: receiptSnapshots.map((snapshot) => snapshot.receipt_id) } }]
                  : []),
              ],
            },
            select: { id: true, amount: true, receipt_date: true },
          })
        : Promise.resolve([]),
      db.club_private_attendance_commissions.findMany({
        where: {
          trainer_id: trainerId,
          attendance_date: { gte: periodFrom, lte: periodTo },
        },
        select: {
          revenue_base: true,
          commission_amount: true,
          refunded_amount: true,
          attendance: { select: { member_id: true } },
        },
      }),
      db.club_trainer_earning_payments.aggregate({
        where: {
          trainer_id: trainerId,
          OR: [
            { period_from: periodFrom, period_to: periodTo },
            { period_from: null, period_to: null, payment_date: { gte: periodFrom, lte: periodTo } },
          ],
        },
        _sum: { amount: true },
      }),
      trainer.employee_id
        ? db.club_trainer_commission_settings.findUnique({
            where: { employee_id: trainer.employee_id },
            include: { tiers: true },
          })
        : Promise.resolve(null),
      db.club_trainer_subscription_refund_commissions.findMany({
        where: {
          trainer_id: trainerId,
          refund_date: { gte: periodFrom, lte: periodTo },
        },
      }),
    ]);

    const missingSubIds = [...new Set(classes.flatMap((cls) => cls.enrollments
      .filter((row) => row.attendance_status === 'attended' && row.session_value_snapshot == null && row.subscription_id)
      .map((row) => row.subscription_id!)))];
    const packageRows = missingSubIds.length ? await db.club_subscriptions.findMany({
      where: { id: { in: missingSubIds } },
      select: { id: true, subscription_value: true, discount_enabled: true, discount_value: true, sessions_count: true },
    }) : [];
    const packageById = new Map(packageRows.map((row) => [row.id, row]));
    const memberValue = (row: { session_value_snapshot: unknown; subscription_id: number | null }) =>
      row.session_value_snapshot != null ? Number(row.session_value_snapshot) : (packageSessionValue(row.subscription_id ? packageById.get(row.subscription_id) : null) ?? 0);
    let classRevenue = 0;
    let classCommission = 0;
    const memberIds = new Set<number>();
    for (const cls of classes) {
      const attended = cls.enrollments.filter((row) => row.attendance_status === 'attended');
      attended.forEach((row) => memberIds.add(row.member_id));
      const salary = await this.salaryForClassDate(trainerId, cls.class_date, db);
      for (const row of attended) {
        const value = memberValue(row);
        classRevenue += value;
        const pct = toNum(row.commission_percentage_snapshot ?? cls.commission_percentage ?? salary?.class_commission_percentage);
        classCommission += Math.round(value * pct) / 100;
      }
    }
    const classGuests = await db.club_class_guest_attendance.findMany({ where: { class_id: { in: classes.filter((cls) => cls.status !== 'cancelled').map((cls) => cls.id) } } });
    for (const guest of classGuests) {
      classRevenue += toNum(guest.amount);
      classCommission += Math.round(toNum(guest.amount) * toNum(guest.commission_percentage)) / 100;
    }
    let subscriptionRevenue = 0;
    let subscriptionCommission = 0;
    const receiptSources: TrainerReceiptSource[] = [];
    for (const receipt of receipts) {
      const source = await trainerReceiptSource(db as Prisma.TransactionClient, trainerId, receipt, receiptSnapshots);
      if (!source) continue;
      receiptSources.push(source);
      subscriptionRevenue += source.base;
      subscriptionCommission += source.commission;
    }
    privateCommissions.forEach((row) => memberIds.add(row.attendance.member_id));
    const privateRevenue = privateCommissions.reduce((sum, row) => sum + toNum(row.revenue_base), 0);
    const privateCommission = privateCommissions.reduce((sum, row) => sum + Math.max(0, toNum(row.commission_amount) - toNum(row.refunded_amount)), 0);
    subscriptionRevenue += privateRevenue;
    subscriptionCommission += privateCommission;
    const refundBase = refundCommissions.reduce((sum, row) => sum + toNum(row.base_amount), 0);
    const refundCommission = refundCommissions.reduce((sum, row) => sum + toNum(row.commission_amount), 0);
    subscriptionRevenue -= refundBase;
    subscriptionCommission -= refundCommission;
    classRevenue = roundMoney(classRevenue);
    classCommission = roundMoney(classCommission);
    subscriptionRevenue = roundMoney(subscriptionRevenue);
    subscriptionCommission = roundMoney(subscriptionCommission);
    const revenue = roundMoney(classRevenue + subscriptionRevenue);
    const target = effectiveTarget(toNum(setting?.base_target), {
      mode: setting?.target_period_mode,
      startDate: setting?.target_start_date,
      endDate: setting?.target_end_date,
      days: setting?.target_days,
    }, periodFrom, periodTo);
    const targetUnit = setting?.target_unit === 'money' ? 'money' : 'members';
    const achieved = targetUnit === 'money' ? revenue : memberIds.size;
    const achievementPct = target > 0 ? roundMoney((achieved / target) * 100) : achieved > 0 ? 100 : 0;
    const tier = pickCommissionTier((setting?.tiers ?? []).map((row) => ({
      minAchievementPct: toNum(row.min_achievement_pct),
      maxAchievementPct: row.max_achievement_pct == null ? null : toNum(row.max_achievement_pct),
      commissionPercent: toNum(row.commission_percent),
      label: row.label,
    })), achievementPct);
    const commissionMode: TrainerCommissionMode = setting?.commission_mode === 'tiered' || setting?.commission_mode === 'combined'
      ? setting.commission_mode
      : 'attendance';
    const attendanceCommission = roundMoney(classCommission + subscriptionCommission);
    const targetCommission = roundMoney(revenue * toNum(tier?.commissionPercent) / 100);
    const paidAmount = toNum(paid._sum.amount);
    const balance = calculateTrainerEarnings({
      attendanceCommission,
      targetCommission,
      commissionMode,
      paid: paidAmount,
    });
    return {
      trainerId,
      periodFrom,
      periodTo,
      classRevenue,
      classCommission,
      subscriptionRevenue,
      subscriptionCommission,
      privateCommission,
      refundCommission: roundMoney(refundCommission),
      refundBase: roundMoney(refundBase),
      receiptSources,
      attendanceCommission,
      targetCommission,
      commissionMode,
      revenue,
      target,
      targetUnit,
      achieved,
      achievementPct,
      commissionPercent: commissionMode === 'tiered'
        ? toNum(tier?.commissionPercent)
        : revenue > 0 ? roundMoney(balance.earned / revenue * 100) : 0,
      achievedTier: commissionMode === 'attendance' ? 'عمولة الحضور' : tier?.label ?? 'بدون شريحة',
      totalTrainees: memberIds.size,
      ...balance,
    };
  }

  private async salaryForClassDate(
    trainerId: number,
    classDate: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    return db.club_trainer_salaries.findFirst({
      where: {
        trainer_id: trainerId,
        effective_date: { lte: classDate },
        OR: [{ end_date: null }, { end_date: { gte: classDate } }],
      },
      orderBy: { effective_date: 'desc' },
    });
  }

  private async recalculateRatingAvg(trainerId: number, tx?: Prisma.TransactionClient) {
    return recalculateTrainerRatingAvg(tx ?? this.prisma, trainerId);
  }

  async addRating(trainerId: number, body: Record<string, unknown>) {
    await this.findOne(trainerId);
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('التقييم يجب أن يكون بين 1 و 5');
    }
    const attendanceId = body.attendanceId != null ? Number(body.attendanceId) : null;
    const memberId = body.memberId != null ? Number(body.memberId) : null;
    if (attendanceId != null) {
      const attendance = await this.prisma.club_attendance.findUnique({
        where: { id: attendanceId },
        select: {
          id: true,
          member_id: true,
          status: true,
          private_commission: { select: { trainer_id: true } },
        },
      });
      if (!attendance?.private_commission || memberId == null) {
        throw new BadRequestException('لا يمكن تقييم جلسة غير مرتبطة بحضور Private صالح');
      }
      try {
        assertPrivateAttendanceRating(
          {
            status: attendance.status,
            memberId: attendance.member_id,
            trainerId: attendance.private_commission.trainer_id,
          },
          { memberId, trainerId },
        );
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'التقييم غير صالح');
      }
    }
    let row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.club_trainer_ratings.create({
          data: {
            trainer_id: trainerId,
            member_id: memberId,
            attendance_id: attendanceId,
            rating,
            comment: body.comment ? String(body.comment) : null,
          },
        });
        const avg = await this.recalculateRatingAvg(trainerId, tx);
        return { ...created, ratingAvg: avg };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attendanceId != null) {
        throw new ConflictException('تم تقييم جلسة الحضور هذه بالفعل');
      }
      throw error;
    }
    return {
      id: row.id,
      trainerId: row.trainer_id,
      memberId: row.member_id,
      attendanceId: row.attendance_id,
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

  async workspace(id: number, query: { dateFrom?: string; dateTo?: string }) {
    const today = localDateString();
    const trainer = await this.findOne(id);
    const setting = trainer.employeeId
      ? await this.prisma.club_trainer_commission_settings.findUnique({
          where: { employee_id: trainer.employeeId },
          include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
        })
      : null;
    const currentCycle = resolveTargetCycle({
      mode: setting?.target_period_mode,
      startDate: setting?.target_start_date,
      endDate: setting?.target_end_date,
      days: setting?.target_days,
    }, today);
    const dateFrom = query.dateFrom ?? currentCycle.startDate;
    const dateTo = query.dateTo ?? (today < currentCycle.endDate ? today : currentCycle.endDate);
    assertDateOrder(dateFrom, dateTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');

    const details = await this.findDetails(id, { dateFrom, dateTo });
    const [earnings, payments, ratings] = await Promise.all([
      this.earningsSummary(id, dateFrom, dateTo),
      this.listEarningPayments(id),
      this.listRatings(id),
    ]);
    const revenue = Math.round((earnings.classRevenue + earnings.subscriptionRevenue) * 100) / 100;
    const ratingDistribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as Record<'1' | '2' | '3' | '4' | '5', number>;
    for (const row of ratings) {
      const value = Math.max(1, Math.min(5, Math.round(row.rating))) as 1 | 2 | 3 | 4 | 5;
      ratingDistribution[String(value) as keyof typeof ratingDistribution] += 1;
    }

    return {
      trainer: details.trainer,
      stats: {
        sessions: details.statistics.totalClasses,
        uniqueMembers: details.statistics.uniqueMembers,
        attendance: details.statistics.totalEnrollments,
        revenue,
        target: earnings.target,
        targetUnit: earnings.targetUnit,
        achievementPct: earnings.achievementPct,
        commissionPercent: earnings.commissionPercent,
        earned: earnings.earned,
        paid: earnings.paid,
        remaining: earnings.remaining,
        overpaid: earnings.overpaid,
        ratingAvg: details.trainer.ratingAvg,
        ratingCount: ratings.length,
      },
      activeSalary: details.activeSalary,
      commissionSetting: setting
        ? {
            employeeId: setting.employee_id,
            trainerId: setting.trainer_id,
            targetUnit: earnings.targetUnit,
            baseTarget: toNum(setting.base_target),
            commissionMode: earnings.commissionMode,
            privateCommissionMode: setting.private_commission_mode === 'fixed' ? 'fixed' : 'salary',
            privateCommissionPercent: toNum(setting.private_commission_percent),
            targetPeriodMode: setting.target_period_mode ?? 'monthly',
            targetStartDate: setting.target_start_date,
            targetEndDate: setting.target_end_date,
            targetDays: setting.target_days,
            currentCycle,
            tiers: setting.tiers.map((tier) => ({
              id: tier.id,
              minAchievementPct: toNum(tier.min_achievement_pct),
              maxAchievementPct: tier.max_achievement_pct == null ? null : toNum(tier.max_achievement_pct),
              commissionPercent: toNum(tier.commission_percent),
              label: tier.label,
            })),
          }
        : null,
      classes: details.classes,
      payments,
      ratings,
      ratingDistribution,
      currentCycle,
    };
  }

  async performance(query: ListTrainerPerformanceDto) {
    const today = localDateString();
    const dateFrom = query.dateFrom ?? `${today.slice(0, 7)}-01`;
    const dateTo = query.dateTo ?? today;
    assertDateOrder(dateFrom, dateTo, 'تاريخ بداية الفترة يجب أن يسبق نهايتها');
    const search = query.search?.trim();
    const trainers = await this.prisma.club_trainers.findMany({
      where: {
        is_deleted: false,
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { specialization: { contains: search } },
          ],
        } : {}),
      },
      orderBy: { name: 'asc' },
    });
    let filtered = trainers;
    if (query.branchId) {
      const employeeIds = trainers.flatMap((trainer) => trainer.employee_id ? [trainer.employee_id] : []);
      const employees = employeeIds.length
        ? await this.prisma.employees.findMany({
            where: { id: { in: employeeIds }, branch_id_fk: query.branchId },
            select: { id: true },
          })
        : [];
      const allowed = new Set(employees.map((employee) => employee.id));
      filtered = trainers.filter((trainer) => trainer.employee_id != null && allowed.has(trainer.employee_id));
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const selected = filtered.slice((page - 1) * pageSize, page * pageSize);
    const rows = await Promise.all(selected.map(async (trainer) => {
      const workspace = await this.workspace(trainer.id, { dateFrom, dateTo });
      return { trainerId: trainer.id, name: trainer.name, specialization: trainer.specialization, isActive: trainer.is_active, ...workspace.stats };
    }));
    const totals = rows.reduce((acc, row) => ({
      sessions: acc.sessions + row.sessions,
      revenue: acc.revenue + row.revenue,
      earned: acc.earned + row.earned,
      paid: acc.paid + row.paid,
      remaining: acc.remaining + row.remaining,
      ratingAvg: 0,
    }), { sessions: 0, revenue: 0, earned: 0, paid: 0, remaining: 0, ratingAvg: 0 });
    totals.ratingAvg = rows.length ? Math.round((rows.reduce((sum, row) => sum + row.ratingAvg, 0) / rows.length) * 100) / 100 : 0;
    return { ...paginated(rows, filtered.length, page, pageSize), totals, dateFrom, dateTo };
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

    const missingDetailSubIds = [...new Set(classes.flatMap((cls) => cls.status === 'cancelled' ? [] : cls.enrollments
      .filter((row) => row.attendance_status === 'attended' && row.session_value_snapshot == null && row.subscription_id)
      .map((row) => row.subscription_id!)))];
    const detailPackages = missingDetailSubIds.length ? await this.prisma.club_subscriptions.findMany({
      where: { id: { in: missingDetailSubIds } },
      select: { id: true, subscription_value: true, discount_enabled: true, discount_value: true, sessions_count: true },
    }) : [];
    const detailPackageById = new Map(detailPackages.map((row) => [row.id, row]));
    const detailMemberValue = (row: { session_value_snapshot: unknown; subscription_id: number | null }) =>
      row.session_value_snapshot != null ? Number(row.session_value_snapshot) : (packageSessionValue(row.subscription_id ? detailPackageById.get(row.subscription_id) : null) ?? 0);

    for (const cls of classes) {
      const activeEnrollments = cls.status === 'cancelled' ? [] : cls.enrollments.filter((e) => e.attendance_status === 'attended');
      totalEnrollments += activeEnrollments.length;
      activeEnrollments.forEach((e) => uniqueMembers.add(e.member_id));
      const salaryAtClass = await this.salaryForClassDate(id, cls.class_date);
      for (const row of activeEnrollments) {
        const value = detailMemberValue(row);
        totalClassRevenue += value;
        const pct = toNum(row.commission_percentage_snapshot ?? cls.commission_percentage ?? salaryAtClass?.class_commission_percentage);
        totalClassCommission += Math.round(value * pct) / 100;
      }
    }

    const guests = await this.prisma.club_class_guest_attendance.findMany({ where: { class_id: { in: classes.filter((cls) => cls.status !== 'cancelled').map((cls) => cls.id) } } });
    totalEnrollments += guests.length;
    for (const guest of guests) {
      totalClassRevenue += toNum(guest.amount);
      totalClassCommission += Math.round(toNum(guest.amount) * toNum(guest.commission_percentage)) / 100;
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
        specialization: trainerSpecializationInput(body) ?? null,
        color: hexColor(body.color),
        experience: body.experience ? String(body.experience).trim() : null,
        bio: body.bio ? String(body.bio) : null,
        image_url: trainerImageInput(body.imageUrl),
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
          specialization: trainerSpecializationInput(body) ?? null,
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
    const specialization = trainerSpecializationInput(body);
    const row = await this.prisma.club_trainers.update({
      where: { id },
      data: {
        ...(body.employeeId !== undefined ? { employee_id: body.employeeId != null ? Number(body.employeeId) : null } : {}),
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.email !== undefined ? { email: body.email ? String(body.email).trim() : null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ? String(body.phone).trim() : null } : {}),
        ...(specialization !== undefined ? { specialization } : {}),
        ...(body.color !== undefined ? { color: hexColor(body.color) } : {}),
        ...(body.experience !== undefined ? { experience: body.experience ? String(body.experience).trim() : null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio ? String(body.bio) : null } : {}),
        ...(body.imageUrl !== undefined ? { image_url: trainerImageInput(body.imageUrl) } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.mapTrainer(row);
  }

  async remove(id: number) {
    await this.findOne(id);
    const today = localDateString();
    const assigned = await this.prisma.club_subscriptions.count({ where: { private_trainer_id: id, OR: [{ status: 'frozen' }, { subscription_end_date: { gte: today }, status: { in: ['active', 'upcoming'] } }] } });
    if (assigned > 0) throw new BadRequestException('سوِّ اشتراكات البرايفت الجارية والمجدولة قبل حذف المدرب؛ يمكن اختيار كابتن بديل عند التجديد');
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
