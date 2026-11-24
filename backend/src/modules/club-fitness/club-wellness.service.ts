import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesPaymentMethod } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubBranchGroupReader, ClubBranchGroupService } from '../../common/branch-groups/club-branch-group.service';
import { assertPositive, assertWithinRange } from '../../common/validators';
import { paginated } from '../../common/dto/list-result';
import { ClubFitnessLedgerService } from './club-fitness-ledger.service';
import {
  assertMemberExists,
  computeBmi,
  localDateString,
  nextNumber,
  timeOverlap,
  toNum,
} from './club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap, searchMemberIds } from '../club-members/club-member-brief.utils';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';
import { recordSystemRevenue } from '../finance/system-revenue.util';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { clubOperationBranchIds } from '../../common/branch-groups/club-operation-scope';
import { JwtUser } from '../../common/types/jwt-user';
import { isReceptionEmployee } from '../../common/utils/reception-user.util';
import { sortInbodyEntitlements, validateInbodyOffer } from './inbody-entitlements';

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class ClubWellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ClubFitnessLedgerService,
    @Inject(ClubBranchGroupService)
    private readonly branchGroups: Pick<ClubBranchGroupReader, 'siblingBranchIds'> = {
      siblingBranchIds: async (branchId) => [branchId],
    },
    private readonly branchScope: BranchScopeService = new BranchScopeService(),
  ) {}

  private paymentMethod(value: unknown): SalesPaymentMethod {
    const method = String(value ?? 'cash') as SalesPaymentMethod;
    if (!Object.values(SalesPaymentMethod).includes(method)) {
      throw new BadRequestException('طريقة الدفع غير صحيحة');
    }
    return method;
  }

  private async findMemberByCode(memberCode: string) {
    const member = await this.prisma.club_members.findFirst({
      where: {
        member_code: memberCode.trim(),
        is_active: true,
        is_deleted: false,
      },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    if (!member) throw new NotFoundException('لم يتم العثور على عضو بهذا الكود');
    return member;
  }

  private async activeBenefits(memberId: number) {
    const today = localDateString();
    return this.prisma.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: 'active',
        subscription_start_date: { lte: today },
        subscription_end_date: { gte: today },
      },
      include: { type: true },
      orderBy: [{ subscription_end_date: 'asc' }, { id: 'asc' }],
    });
  }

  async getMemberBenefits(memberCode: string, user?: JwtUser) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
    await this.assertInbodyMemberAccess(member.id, user);
    const subscriptions = await this.activeBenefits(member.id);
    const inbody = subscriptions
      .filter((s) => Number(s.type?.inbody_count ?? 0) > s.inbody_used)
      .map((s) => ({
        subscriptionId: s.id,
        subscriptionNumber: s.subscription_number,
        total: Number(s.type?.inbody_count ?? 0),
        used: s.inbody_used,
        remaining: Math.max(0, Number(s.type?.inbody_count ?? 0) - s.inbody_used),
        expiresAt: s.subscription_end_date,
      }));
    const spa = subscriptions
      .filter((s) => s.type?.includes_spa && Number(s.type?.spa_count ?? 0) > s.spa_used)
      .map((s) => ({
        subscriptionId: s.id,
        subscriptionNumber: s.subscription_number,
        total: Number(s.type?.spa_count ?? 0),
        used: s.spa_used,
        remaining: Math.max(0, Number(s.type?.spa_count ?? 0) - s.spa_used),
        expiresAt: s.subscription_end_date,
      }));
    return {
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
        branchId: member.branch_id,
      },
      inbody: { remaining: inbody.reduce((sum, x) => sum + x.remaining, 0), subscriptions: inbody },
      spa: { remaining: spa.reduce((sum, x) => sum + x.remaining, 0), subscriptions: spa },
    };
  }

  async checkInSpaByBarcode(memberCode: string, userId?: number, user?: JwtUser) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
    await this.assertInbodyMemberAccess(member.id, user);
    const scanner = userId == null
      ? null
      : await this.prisma.users?.findUnique({
          where: { user_id: userId },
          select: { branch_id_fk: true },
        });
    const operationBranchId = Number(scanner?.branch_id_fk ?? member.branch_id);
    const compatibleBranchIds = await this.branchGroups.siblingBranchIds(operationBranchId);
    if (!compatibleBranchIds.includes(member.branch_id)) {
      throw new ForbiddenException('لا يمكن تسجيل SPA لعضو تابع لفرع آخر');
    }
    const today = localDateString();
    const duplicate = await this.prisma.club_spa_attendance.findFirst({
      where: { member_id: member.id, attendance_date: today },
    });
    if (duplicate) throw new ConflictException('تم تسجيل حضور السبا بالفعل اليوم');

    const subscriptionId = await this.prisma.$transaction(async (tx) => {
      const consumedSubscriptionId = await this.consumeBenefit(tx, member.id, 'spa', 1);
      if (consumedSubscriptionId == null) {
        throw new BadRequestException('رصيد السبا في الاشتراك غير كافٍ أو انتهت صلاحيته');
      }
      const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
      await tx.club_spa_attendance.create({
        data: {
          member_id: member.id,
          member_code: member.member_code,
          member_name: member.name,
          branch_id: operationBranchId,
          subscription_id: consumedSubscriptionId,
          attendance_date: today,
          check_in_time: time,
          created_by: userId ?? null,
        },
      });
      return consumedSubscriptionId;
    });
    const benefits = await this.getMemberBenefits(memberCode);
    return {
      member: benefits.member,
      subscriptionId,
      remaining: benefits.spa.remaining,
    };
  }

  private async consumeBenefit(
    tx: Prisma.TransactionClient,
    memberId: number,
    kind: 'inbody' | 'spa',
    quantity: number,
  ): Promise<number | null> {
    const today = localDateString();
    // Serialize benefit consumption for this member. This prevents two reception users from
    // consuming the same final allowance concurrently and lets a SPA quantity span multiple
    // active subscriptions without leaving a partial deduction behind.
    await tx.$queryRaw`
      SELECT id
      FROM club_subscriptions
      WHERE member_id = ${memberId}
        AND status = 'active'
        AND subscription_start_date <= ${today}
        AND subscription_end_date >= ${today}
      ORDER BY subscription_end_date ASC, id ASC
      FOR UPDATE
    `;
    const subscriptions = await tx.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: 'active',
        subscription_start_date: { lte: today },
        subscription_end_date: { gte: today },
      },
      include: { type: true },
      orderBy: [{ subscription_end_date: 'asc' }, { id: 'asc' }],
    });
    let remainingQuantity = quantity;
    let primarySubscriptionId: number | null = null;
    for (const subscription of subscriptions) {
      const limit =
        kind === 'inbody'
          ? Number(subscription.type?.inbody_count ?? 0)
          : subscription.type?.includes_spa
            ? Number(subscription.type?.spa_count ?? 0)
            : 0;
      const used = kind === 'inbody' ? subscription.inbody_used : subscription.spa_used;
      const available = Math.max(0, limit - used);
      if (available === 0) continue;
      const consumed = Math.min(available, remainingQuantity);
      const claimed = await tx.club_subscriptions.updateMany({
        where: {
          id: subscription.id,
          ...(kind === 'inbody' ? { inbody_used: used } : { spa_used: used }),
        },
        data:
          kind === 'inbody'
            ? { inbody_used: { increment: consumed } }
            : { spa_used: { increment: consumed } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('تم تغيير رصيد الاشتراك أثناء العملية، أعد المحاولة');
      }
      primarySubscriptionId ??= subscription.id;
      remainingQuantity -= consumed;
      if (remainingQuantity === 0) return primarySubscriptionId;
    }
    return null;
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }

  private async assertNoSpaOverlap(
    serviceId: number,
    bookingDate: string,
    bookingTime: string,
    duration: number,
    excludeId?: number,
  ) {
    const endTime = this.addMinutesToTime(bookingTime, duration);
    const existing = await this.prisma.club_spa_bookings.findMany({
      where: {
        is_active: true,
        service_id: serviceId,
        booking_date: bookingDate,
        status: { not: 'cancelled' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    for (const b of existing) {
      const bEnd = this.addMinutesToTime(b.booking_time, b.duration);
      if (timeOverlap(bookingTime, endTime, b.booking_time, bEnd)) {
        throw new ConflictException('يوجد حجز آخر لنفس الخدمة في هذا التوقيت');
      }
    }
  }

  private validateInbodyMeasurementValues(body: Record<string, unknown>) {
    if (body.weight != null) assertWithinRange(Number(body.weight), 20, 300, 'الوزن');
    if (body.bodyFat != null) assertWithinRange(Number(body.bodyFat), 0, 100, 'نسبة الدهون');
    if (body.muscleMass != null) assertWithinRange(Number(body.muscleMass), 0, 200, 'كتلة العضلات');
    if (body.heightCm != null) assertWithinRange(Number(body.heightCm), 50, 250, 'الطول');
  }

  private async assertUniqueInbodyDay(memberId: number, measurementDate: string, excludeId?: number) {
    const dup = await this.prisma.club_inbody_measurements.findFirst({
      where: {
        member_id: memberId,
        measurement_date: measurementDate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (dup) throw new ConflictException('يوجد قياس InBody لنفس العضو في هذا التاريخ');
  }

  private mapInbodyMeasurement(
    row: {
      id: number;
      member_id: number;
      measurement_date: string;
      weight: Prisma.Decimal | null;
      height_cm: Prisma.Decimal | null;
      body_fat: Prisma.Decimal | null;
      muscle_mass: Prisma.Decimal | null;
      bmi: Prisma.Decimal | null;
      notes: string | null;
      report_url: string | null;
      settlement_source?: string;
      branch_id?: number | null;
      subscription_id?: number | null;
      entitlement_id?: number | null;
      invoice_id?: number | null;
      created_at: Date;
      updated_at: Date;
    },
    memberMap: Map<number, import('../club-members/club-member-brief.utils').MemberBrief>,
  ) {
    return {
      id: row.id,
      memberId: row.member_id,
      branchId: row.branch_id ?? null,
      settlementSource: row.settlement_source ?? 'legacy',
      subscriptionId: row.subscription_id ?? null,
      entitlementId: row.entitlement_id ?? null,
      invoiceId: row.invoice_id ?? null,
      ...attachMemberBrief(row.member_id, memberMap),
      measurementDate: row.measurement_date,
      weight: row.weight != null ? toNum(row.weight) : null,
      heightCm: row.height_cm != null ? toNum(row.height_cm) : null,
      bodyFat: row.body_fat != null ? toNum(row.body_fat) : null,
      muscleMass: row.muscle_mass != null ? toNum(row.muscle_mass) : null,
      bmi: row.bmi != null ? toNum(row.bmi) : null,
      notes: row.notes,
      reportUrl: row.report_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- InBody measurements ---

  /** `gender` defaults to the user's own section; list endpoints pass the resolved رجالي/حريمي/الكل choice. */
  private async inbodyMemberScope(
    user?: JwtUser,
    gender: 'male' | 'female' | null = this.branchScope.memberGenderFilter(user),
  ): Promise<Prisma.club_membersWhereInput> {
    if (!user) return gender ? { gender } : {};
    const branches = await clubOperationBranchIds(this.branchScope, this.branchGroups, user);
    return { is_deleted: false, ...(branches === null ? {} : { branch_id: { in: branches } }), ...(gender ? { gender } : {}) };
  }

  private async assertInbodyMemberAccess(memberId: number, user?: JwtUser) {
    if (!user) return;
    const member = await this.prisma.club_members.findFirst({ where: { AND: [{ id: memberId }, await this.inbodyMemberScope(user)] }, select: { id: true } });
    if (!member) throw new ForbiddenException('العضو خارج الفروع أو الأقسام المسموح بها');
  }

  /** Row branch filter for wellness lists (invoices/bookings/attendance). */
  private wellnessBranchFilter(q: ListClubFitnessDto, user?: JwtUser): Prisma.IntFilter | number | undefined {
    if (!user) return q.branch && q.branch !== 'all' ? Number(q.branch) : undefined;
    const ids = this.branchScope.resolveListFilter(user, q.branch);
    return ids === null ? undefined : { in: ids };
  }

  /**
   * Member ids for the رجالي/حريمي/الكل filter (`requested` = the list's `gender` param); null when no
   * section filter applies. One-section staff are locked to their section (403 for the other one).
   */
  private async genderScopedMemberIds(user?: JwtUser, requested?: string): Promise<number[] | null> {
    const gender = this.branchScope.resolveMemberGenderRequest(user, requested);
    if (gender === null) return null;
    const members = await this.prisma.club_members.findMany({ where: await this.inbodyMemberScope(user, gender), select: { id: true } });
    return members.map((member) => member.id);
  }

  /** By-id guard for wellness rows: row branch must be in scope and a linked member in the user's section. */
  private async assertWellnessRowAccess(user: JwtUser | undefined, branchId: number | null, memberId: number | null) {
    if (!user) return;
    this.branchScope.assertBranchAllowed(user, branchId, 'لا تملك صلاحية الوصول لبيانات هذا الفرع');
    if (memberId != null) {
      const member = await this.prisma.club_members.findFirst({ where: { id: memberId }, select: { gender: true } });
      if (member && !this.branchScope.isMemberGenderAllowed(user, member.gender)) {
        throw new ForbiddenException('لا تملك صلاحية الوصول لأعضاء هذا القسم');
      }
    }
  }

  private assertInbodyDateAccess(date: string, user?: JwtUser) {
    if (isReceptionEmployee(user) && date !== localDateString()) throw new ForbiddenException('موظف الاستقبال يمكنه الوصول إلى قياسات اليوم فقط');
  }

  async listInbodyMeasurements(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_inbody_measurementsWhereInput = {};
    const gender = this.branchScope.resolveMemberGenderRequest(user, q.gender);
    const scopedIds = user || gender ? (await this.prisma.club_members.findMany({ where: await this.inbodyMemberScope(user, gender), select: { id: true } })).map(member => member.id) : null;
    if (scopedIds) where.member_id = { in: scopedIds };
    if (q.memberId) where.member_id = scopedIds === null || scopedIds.includes(Number(q.memberId)) ? Number(q.memberId) : { in: [] };
    if (q.dateFrom || q.dateTo) {
      where.measurement_date = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    }
    if (isReceptionEmployee(user)) where.measurement_date = localDateString();

    if (q.search?.trim()) {
      const memberIds = await searchMemberIds(this.prisma, q.search);
      if (memberIds.length === 0) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.member_id = { in: memberIds.filter(id => (scopedIds === null || scopedIds.includes(id)) && (!q.memberId || id === Number(q.memberId))) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_measurements.findMany({
        where,
        orderBy: { measurement_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_measurements.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => this.mapInbodyMeasurement(r, memberMap)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Preview only: the database assigns the final auto-increment id on save. */
  async nextInbodyFileNumber() {
    const result = await this.prisma.club_inbody_measurements.aggregate({
      _max: { id: true },
    });
    return (result._max.id ?? 0) + 1;
  }

  /** SPA barcode visits are distinct from paid SPA invoices and are reportable by date/branch. */
  async listSpaAttendance(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_spa_attendanceWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    const branch = this.wellnessBranchFilter(q, user);
    if (branch !== undefined) where.branch_id = branch;
    const scopedMemberIds = await this.genderScopedMemberIds(user, q.gender);
    if (scopedMemberIds) where.AND = [{ member_id: { in: scopedMemberIds } }];
    if (q.dateFrom || q.dateTo) {
      where.attendance_date = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ member_name: { contains: s } }, { member_code: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.club_spa_attendance.findMany({ where, orderBy: [{ attendance_date: 'desc' }, { check_in_time: 'desc' }], skip: q.skip, take: q.take }),
      this.prisma.club_spa_attendance.count({ where }),
    ]);
    return paginated(rows.map((row) => ({
      id: row.id, memberId: row.member_id, memberCode: row.member_code, memberName: row.member_name,
      branchId: row.branch_id, subscriptionId: row.subscription_id, attendanceDate: row.attendance_date,
      checkInTime: row.check_in_time, createdAt: row.created_at,
    })), total, q.page, q.pageSize);
  }

  async findInbodyMeasurement(id: number, user?: JwtUser) {
    const row = await this.prisma.club_inbody_measurements.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قياس InBody غير موجود');
    this.assertInbodyDateAccess(row.measurement_date, user);
    await this.assertInbodyMemberAccess(row.member_id, user);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return this.mapInbodyMeasurement(row, memberMap);
  }

  async createInbodyMeasurement(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.memberId || !body.measurementDate) {
      throw new BadRequestException('كود العضو وتاريخ القياس مطلوبان');
    }
    await assertMemberExists(this.prisma, Number(body.memberId));
    await this.assertInbodyMemberAccess(Number(body.memberId), user);
    this.assertInbodyDateAccess(String(body.measurementDate), user);
    this.validateInbodyMeasurementValues(body);
    await this.assertUniqueInbodyDay(Number(body.memberId), String(body.measurementDate));
    const weight = body.weight != null ? Number(body.weight) : null;
    const heightCm = body.heightCm != null ? Number(body.heightCm) : null;
    const bmi =
      body.bmi != null
        ? Number(body.bmi)
        : weight != null && heightCm != null
          ? computeBmi(weight, heightCm)
          : null;
    const row = await this.prisma.club_inbody_measurements.create({
      data: {
        member_id: Number(body.memberId),
        measurement_date: String(body.measurementDate),
        weight,
        height_cm: heightCm,
        body_fat: body.bodyFat != null ? Number(body.bodyFat) : null,
        muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null,
        bmi,
        notes: body.notes ? String(body.notes) : null,
        report_url: body.reportUrl ? String(body.reportUrl) : null,
      },
    });
    return this.findInbodyMeasurement(row.id, user);
  }

  async updateInbodyMeasurement(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findInbodyMeasurement(id, user);
    this.validateInbodyMeasurementValues(body);
    const memberId = body.memberId != null ? Number(body.memberId) : existing.memberId;
    const measurementDate =
      body.measurementDate != null ? String(body.measurementDate) : existing.measurementDate;
    this.assertInbodyDateAccess(measurementDate, user);
    await this.assertInbodyMemberAccess(memberId, user);
    if (body.memberId != null) await assertMemberExists(this.prisma, memberId);
    await this.assertUniqueInbodyDay(memberId, measurementDate, id);
    const weight = body.weight !== undefined ? (body.weight != null ? Number(body.weight) : null) : existing.weight;
    const heightCm =
      body.heightCm !== undefined ? (body.heightCm != null ? Number(body.heightCm) : null) : existing.heightCm;
    const bmi =
      body.bmi !== undefined
        ? body.bmi != null
          ? Number(body.bmi)
          : null
        : weight != null && heightCm != null
          ? computeBmi(weight, heightCm)
          : existing.bmi;
    await this.prisma.club_inbody_measurements.update({
      where: { id },
      data: {
        ...(body.memberId != null ? { member_id: memberId } : {}),
        ...(body.measurementDate != null ? { measurement_date: measurementDate } : {}),
        ...(body.weight !== undefined ? { weight } : {}),
        ...(body.heightCm !== undefined ? { height_cm: heightCm } : {}),
        ...(body.bodyFat !== undefined ? { body_fat: body.bodyFat != null ? Number(body.bodyFat) : null } : {}),
        ...(body.muscleMass !== undefined ? { muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null } : {}),
        ...(body.bmi !== undefined || (body.weight !== undefined && body.heightCm !== undefined) ? { bmi } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        ...(body.reportUrl !== undefined ? { report_url: body.reportUrl ? String(body.reportUrl) : null } : {}),
      },
    });
    return this.findInbodyMeasurement(id, user);
  }

  async removeInbodyMeasurement(id: number, user?: JwtUser) {
    await this.findInbodyMeasurement(id, user);
    await this.prisma.club_inbody_measurements.delete({ where: { id } });
    return { success: true };
  }

  // --- InBody invoices ---

  private mapInbodyInvoice(row: {
    id: number;
    invoice_number: string;
    is_member: boolean;
    member_id: number | null;
    customer_name: string | null;
    service_id: number | null;
    branch_id: number;
    unit_price: Prisma.Decimal;
    total_amount: Prisma.Decimal;
    invoice_date: string;
    invoice_time: string | null;
    status: string;
    payment_method: SalesPaymentMethod | null;
    subscription_id: number | null;
    covered_by_subscription: boolean;
    created_by: number | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      isMember: row.is_member,
      memberId: row.member_id,
      customerName: row.customer_name,
      serviceId: row.service_id,
      branchId: row.branch_id,
      unitPrice: toNum(row.unit_price),
      totalAmount: toNum(row.total_amount),
      invoiceDate: row.invoice_date,
      invoiceTime: row.invoice_time,
      status: row.status,
      paymentMethod: row.payment_method,
      subscriptionId: row.subscription_id,
      coveredBySubscription: row.covered_by_subscription,
      createdBy: row.created_by,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listInbodyInvoices(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_inbody_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    const branch = this.wellnessBranchFilter(q, user);
    if (branch !== undefined) where.branch_id = branch;
    const scopedMemberIds = await this.genderScopedMemberIds(user, q.gender);
    if (scopedMemberIds) where.AND = [{ OR: [{ member_id: null }, { member_id: { in: scopedMemberIds } }] }];

    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_invoices.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_invoices.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        ...this.mapInbodyInvoice(r),
        ...attachMemberBrief(r.member_id, memberMap),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findInbodyInvoice(id: number, user?: JwtUser) {
    const row = await this.prisma.club_inbody_invoices.findFirst({
      where: { id, is_active: true },
    });
    if (!row) throw new NotFoundException('فاتورة InBody غير موجودة');
    await this.assertWellnessRowAccess(user, row.branch_id, row.member_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapInbodyInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createInbodyInvoice(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.branchId) {
      throw new BadRequestException('الفرع مطلوب');
    }
    if (user) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    const isMember = body.isMember !== false;
    if (isMember) {
      if (body.memberId == null) {
        throw new BadRequestException('كود العضو مطلوب لفاتورة العضو');
      }
      await assertMemberExists(this.prisma, Number(body.memberId));
    }
    if (body.memberId != null) await this.assertInbodyMemberAccess(Number(body.memberId), user);

    if (body.serviceId == null) throw new BadRequestException('خدمة InBody مطلوبة');
    const service = await this.prisma.club_inbody_services.findFirst({
      where: { id: Number(body.serviceId), is_active: true },
    });
    if (!service) throw new NotFoundException('خدمة InBody غير موجودة');
    const unitPrice = toNum(service.price);
    const invoiceDate = body.invoiceDate ? String(body.invoiceDate) : localDateString();
    const paymentMethod = this.paymentMethod(body.paymentMethod);

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const invoiceNumber = await nextNumber(tx, 'club_inbody_invoices', 'invoice_number', `INB-${year}`);
      const memberId = body.memberId != null ? Number(body.memberId) : null;
      const wantsBenefit = isMember && body.useSubscriptionBenefit === true && memberId != null;
      const subscriptionId =
        wantsBenefit
          ? await this.consumeBenefit(tx, memberId, 'inbody', 1)
          : null;
      if (wantsBenefit && subscriptionId == null) {
        throw new BadRequestException('رصيد InBody في الاشتراك غير كافٍ أو انتهت صلاحيته');
      }
      const covered = subscriptionId != null;
      const totalAmount = covered ? 0 : unitPrice;
      const status = covered ? 'included' : body.status ? String(body.status) : 'paid';
      const invoice = await tx.club_inbody_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          is_member: body.isMember !== false,
          member_id: memberId,
          customer_name: body.customerName ? String(body.customerName) : null,
          service_id: body.serviceId != null ? Number(body.serviceId) : null,
          branch_id: Number(body.branchId),
          unit_price: unitPrice,
          total_amount: totalAmount,
          invoice_date: invoiceDate,
          invoice_time: body.invoiceTime ? String(body.invoiceTime) : null,
          status,
          payment_method: covered ? null : paymentMethod,
          subscription_id: subscriptionId,
          covered_by_subscription: covered,
          created_by: userId ?? null,
        },
      });

      // A paid member invoice buys a measurement balance (1 for the single price, N for a package).
      // Reception's «إضافة InBody» performs one now, so one is consumed unless `consumeNow: false`.
      if (!covered && memberId != null && isMember) {
        const branchId = Number(body.branchId);
        await this.assertInbodySaleAllowed(tx, memberId, branchId);
        const expiresAt = service.validity_days ? addCalendarDays(invoiceDate, service.validity_days) : null;
        await tx.club_inbody_entitlements.create({
          data: {
            member_id: memberId,
            branch_id: branchId,
            service_id: service.id,
            invoice_id: invoice.id,
            total_count: Math.max(1, service.measurement_count),
            used_count: body.consumeNow === false ? 0 : 1,
            purchased_date: invoiceDate,
            expires_at: expiresAt,
          },
        });
      }

      if (status === 'paid') {
        await this.ledger.postPayment(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id ?? undefined,
            amount: totalAmount,
            branchId: invoice.branch_id,
            invoiceDate,
            paymentMethod,
            createdBy: userId,
            description: `فاتورة InBody ${invoice.invoice_number}`,
          },
          tx,
        );
        await recordSystemRevenue(tx, {
          sourceModule: 'inbody_invoice',
          sourceRef: invoice.invoice_number,
          date: invoiceDate,
          source: 'InBody',
          subSource: service.name,
          amount: totalAmount,
          description: `فاتورة InBody ${invoice.invoice_number}`,
          customerName: body.customerName ? String(body.customerName) : undefined,
          invoiceNumber: invoice.invoice_number,
          branchId: invoice.branch_id,
          createdBy: userId,
          paymentMethod,
        });
      }

      return invoice;
    });

    return this.mapInbodyInvoice(row);
  }

  async updateInbodyInvoice(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findInbodyInvoice(id, user);
    if (user && body.branchId != null) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    if (body.memberId != null) await this.assertInbodyMemberAccess(Number(body.memberId), user);
    if (existing.coveredBySubscription) {
      throw new BadRequestException('لا يمكن تعديل فاتورة تم خصمها من الاشتراك');
    }
    const unitPrice = body.unitPrice != null ? Number(body.unitPrice) : undefined;
    const nextStatus = body.status != null ? String(body.status) : existing.status;
    const wasPaid = existing.status === 'paid';
    const willBePaid = nextStatus === 'paid';

    // Money on an already-paid invoice is locked in the GL. Changing the amount would silently
    // desync the ledger, so forbid it (reverse+repost is out of scope here).
    if (wasPaid && unitPrice != null && unitPrice !== existing.unitPrice) {
      throw new BadRequestException('لا يمكن تعديل فاتورة مدفوعة');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_inbody_invoices.update({
        where: { id },
        data: {
          ...(body.isMember !== undefined ? { is_member: Boolean(body.isMember) } : {}),
          ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
          ...(body.customerName !== undefined ? { customer_name: body.customerName ? String(body.customerName) : null } : {}),
          ...(body.serviceId !== undefined ? { service_id: body.serviceId != null ? Number(body.serviceId) : null } : {}),
          ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
          ...(unitPrice != null ? { unit_price: unitPrice, total_amount: unitPrice } : {}),
          ...(body.invoiceDate != null ? { invoice_date: String(body.invoiceDate) } : {}),
          ...(body.invoiceTime !== undefined ? { invoice_time: body.invoiceTime ? String(body.invoiceTime) : null } : {}),
          ...(body.status != null ? { status: nextStatus } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
      });

      // On the unpaid→paid transition, post the GL payment now. postEntry is idempotent per
      // invoice number, so a repeat transition (or a re-save) won't double-post.
      if (!wasPaid && willBePaid) {
        await this.ledger.postPayment(
          {
            invoiceId: updated.id,
            invoiceNumber: updated.invoice_number,
            memberId: updated.member_id ?? undefined,
            amount: toNum(updated.total_amount),
            branchId: updated.branch_id,
            description: `فاتورة InBody ${updated.invoice_number}`,
          },
          tx,
        );
      }

      return updated;
    });
    return this.mapInbodyInvoice(row);
  }

  async removeInbodyInvoice(id: number, user?: JwtUser) {
    const existing = await this.findInbodyInvoice(id, user);
    // A paid invoice has a GL entry; soft-deleting it would leave revenue on the books with no
    // visible source doc. Block it (GL reversal on delete is out of scope here).
    if (existing.status === 'paid' || existing.coveredBySubscription) {
      throw new BadRequestException('لا يمكن حذف فاتورة مدفوعة أو مستخدمة من الاشتراك');
    }
    await this.prisma.club_inbody_invoices.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa services ---

  async listSpaServices(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_servicesWhereInput = {};
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    if (q.search?.trim()) where.name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_services.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_services.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        duration: r.duration,
        price: toNum(r.price),
        branchId: r.branch_id,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async listSpaServicesCatalog() {
    const rows = await this.prisma.club_spa_services.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      duration: r.duration,
      price: toNum(r.price),
      branchId: r.branch_id,
    }));
  }

  async findSpaService(id: number) {
    const row = await this.prisma.club_spa_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة السبا غير موجودة');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      duration: row.duration,
      price: toNum(row.price),
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createSpaService(body: Record<string, unknown>) {
    if (!body.name || body.price == null) {
      throw new BadRequestException('اسم الخدمة والسعر مطلوبان');
    }
    const row = await this.prisma.club_spa_services.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        duration: body.duration != null ? Number(body.duration) : 60,
        price: Number(body.price),
        branch_id: body.branchId != null ? Number(body.branchId) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.findSpaService(row.id);
  }

  async updateSpaService(id: number, body: Record<string, unknown>) {
    await this.findSpaService(id);
    await this.prisma.club_spa_services.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.duration != null ? { duration: Number(body.duration) } : {}),
        ...(body.price != null ? { price: Number(body.price) } : {}),
        ...(body.branchId !== undefined ? { branch_id: body.branchId != null ? Number(body.branchId) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findSpaService(id);
  }

  async removeSpaService(id: number) {
    await this.findSpaService(id);
    await this.prisma.club_spa_services.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa bookings ---

  private mapSpaBooking(row: {
    id: number;
    booking_number: string;
    member_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
    service_id: number;
    branch_id: number;
    booking_date: string;
    booking_time: string;
    duration: number;
    price: Prisma.Decimal;
    status: string;
    payment_status: string;
    notes: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string; price: Prisma.Decimal; duration: number };
  }) {
    return {
      id: row.id,
      bookingNumber: row.booking_number,
      memberId: row.member_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      serviceId: row.service_id,
      branchId: row.branch_id,
      bookingDate: row.booking_date,
      bookingTime: row.booking_time,
      duration: row.duration,
      price: toNum(row.price),
      status: row.status,
      paymentStatus: row.payment_status,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      service: row.service
        ? {
            id: row.service.id,
            name: row.service.name,
            price: toNum(row.service.price),
            duration: row.service.duration,
          }
        : undefined,
    };
  }

  async listSpaBookings(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_spa_bookingsWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    const branch = this.wellnessBranchFilter(q, user);
    if (branch !== undefined) where.branch_id = branch;
    const scopedMemberIds = await this.genderScopedMemberIds(user, q.gender);
    if (scopedMemberIds) where.AND = [{ OR: [{ member_id: null }, { member_id: { in: scopedMemberIds } }] }];

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_bookings.findMany({
        where,
        include: { service: { select: { id: true, name: true, price: true, duration: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_bookings.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        ...this.mapSpaBooking(r),
        ...attachMemberBrief(r.member_id, memberMap),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findSpaBooking(id: number, user?: JwtUser) {
    const row = await this.prisma.club_spa_bookings.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true, price: true, duration: true } } },
    });
    if (!row) throw new NotFoundException('حجز السبا غير موجود');
    await this.assertWellnessRowAccess(user, row.branch_id, row.member_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaBooking(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaBooking(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.serviceId || !body.branchId || !body.bookingDate || !body.bookingTime) {
      throw new BadRequestException('الخدمة والفرع وتاريخ ووقت الحجز مطلوبة');
    }
    if (user) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    if (body.memberId != null) {
      await assertMemberExists(this.prisma, Number(body.memberId));
      await this.assertInbodyMemberAccess(Number(body.memberId), user);
    }

    const service = await this.prisma.club_spa_services.findUnique({
      where: { id: Number(body.serviceId) },
    });
    if (!service) throw new NotFoundException('خدمة السبا غير موجودة');

    const price = toNum(service.price);
    const duration = body.duration != null ? Number(body.duration) : service.duration;
    const bookingDate = String(body.bookingDate);
    const bookingTime = String(body.bookingTime);
    await this.assertNoSpaOverlap(Number(body.serviceId), bookingDate, bookingTime, duration);

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const bookingNumber = await nextNumber(tx, 'club_spa_bookings', 'booking_number', `SPA-${year}`);
      return tx.club_spa_bookings.create({
        data: {
          booking_number: bookingNumber,
          member_id: body.memberId != null ? Number(body.memberId) : null,
          customer_name: body.customerName ? String(body.customerName) : null,
          customer_phone: body.customerPhone ? String(body.customerPhone) : null,
          service_id: Number(body.serviceId),
          branch_id: Number(body.branchId),
          booking_date: String(body.bookingDate),
          booking_time: String(body.bookingTime),
          duration,
          price,
          status: (body.status as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set']) ?? 'pending',
          payment_status: (body.paymentStatus as Prisma.EnumClubFitnessPaymentStatusFieldUpdateOperationsInput['set']) ?? 'unpaid',
          notes: body.notes ? String(body.notes) : null,
        },
        include: { service: { select: { id: true, name: true, price: true, duration: true } } },
      });
    });

    return this.mapSpaBooking(row);
  }

  async updateSpaBooking(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findSpaBooking(id, user);
    if (user && body.branchId != null) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    if (body.memberId != null) await this.assertInbodyMemberAccess(Number(body.memberId), user);
    const serviceId = body.serviceId != null ? Number(body.serviceId) : existing.serviceId;
    const bookingDate = body.bookingDate != null ? String(body.bookingDate) : existing.bookingDate;
    const bookingTime = body.bookingTime != null ? String(body.bookingTime) : existing.bookingTime;
    const duration = body.duration != null ? Number(body.duration) : existing.duration;
    if (
      body.serviceId != null ||
      body.bookingDate != null ||
      body.bookingTime != null ||
      body.duration != null
    ) {
      await this.assertNoSpaOverlap(serviceId, bookingDate, bookingTime, duration, id);
    }

    const wasPaid = existing.paymentStatus === 'paid';
    const nextPaymentStatus =
      body.paymentStatus != null ? String(body.paymentStatus) : existing.paymentStatus;
    const willBePaid = nextPaymentStatus === 'paid';

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_spa_bookings.update({
        where: { id },
        data: {
          ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
          ...(body.customerName !== undefined ? { customer_name: body.customerName ? String(body.customerName) : null } : {}),
          ...(body.customerPhone !== undefined ? { customer_phone: body.customerPhone ? String(body.customerPhone) : null } : {}),
          ...(body.serviceId != null ? { service_id: serviceId } : {}),
          ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
          ...(body.bookingDate != null ? { booking_date: bookingDate } : {}),
          ...(body.bookingTime != null ? { booking_time: bookingTime } : {}),
          ...(body.duration != null ? { duration } : {}),
          ...(body.price != null ? { price: Number(body.price) } : {}),
          ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.paymentStatus != null ? { payment_status: nextPaymentStatus as Prisma.EnumClubFitnessPaymentStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
        include: { service: { select: { id: true, name: true, price: true, duration: true } } },
      });

      if (!wasPaid && willBePaid && updated.member_id) {
        const year = new Date().getFullYear();
        const invoiceNumber = await nextNumber(tx, 'club_spa_invoices', 'invoice_number', `SPINV-${year}`);
        const amount = toNum(updated.price);
        const invoice = await tx.club_spa_invoices.create({
          data: {
            invoice_number: invoiceNumber,
            member_id: updated.member_id,
            service_id: updated.service_id,
            branch_id: updated.branch_id,
            quantity: 1,
            unit_price: amount,
            total_amount: amount,
            invoice_date: updated.booking_date,
            status: 'paid',
          },
        });
        await this.ledger.postPayment(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id,
            amount,
            branchId: invoice.branch_id,
            description: `حجز SPA ${updated.booking_number}`,
          },
          tx,
        );
      }

      return updated;
    });

    return this.mapSpaBooking(row);
  }

  async removeSpaBooking(id: number, user?: JwtUser) {
    await this.findSpaBooking(id, user);
    await this.prisma.club_spa_bookings.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }

  // --- Spa invoices ---

  private mapSpaInvoice(row: {
    id: number;
    invoice_number: string;
    member_id: number;
    service_id: number;
    branch_id: number;
    quantity: number;
    unit_price: Prisma.Decimal;
    total_amount: Prisma.Decimal;
    invoice_date: string;
    status: string;
    payment_method: SalesPaymentMethod | null;
    subscription_id: number | null;
    covered_by_subscription: boolean;
    created_by: number | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    service?: { id: number; name: string };
  }) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      memberId: row.member_id,
      serviceId: row.service_id,
      branchId: row.branch_id,
      quantity: row.quantity,
      unitPrice: toNum(row.unit_price),
      totalAmount: toNum(row.total_amount),
      invoiceDate: row.invoice_date,
      status: row.status,
      paymentMethod: row.payment_method,
      subscriptionId: row.subscription_id,
      coveredBySubscription: row.covered_by_subscription,
      createdBy: row.created_by,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      service: row.service,
    };
  }

  async listSpaInvoices(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_spa_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    const branch = this.wellnessBranchFilter(q, user);
    if (branch !== undefined) where.branch_id = branch;
    const scopedMemberIds = await this.genderScopedMemberIds(user, q.gender);
    if (scopedMemberIds) where.AND = [{ member_id: { in: scopedMemberIds } }];

    const [rows, total] = await Promise.all([
      this.prisma.club_spa_invoices.findMany({
        where,
        include: { service: { select: { id: true, name: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_spa_invoices.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        ...this.mapSpaInvoice(r),
        ...attachMemberBrief(r.member_id, memberMap),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findSpaInvoice(id: number, user?: JwtUser) {
    const row = await this.prisma.club_spa_invoices.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('فاتورة السبا غير موجودة');
    await this.assertWellnessRowAccess(user, row.branch_id, row.member_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaInvoice(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.memberId || !body.serviceId || !body.branchId) {
      throw new BadRequestException('العضو والخدمة والفرع مطلوبة');
    }
    if (user) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    await assertMemberExists(this.prisma, Number(body.memberId));
    await this.assertInbodyMemberAccess(Number(body.memberId), user);

    const quantity = assertPositive(body.quantity ?? 1, 'الكمية');
    const service = await this.prisma.club_spa_services.findUnique({
      where: { id: Number(body.serviceId) },
    });
    if (!service) throw new NotFoundException('خدمة السبا غير موجودة');
    if (!service.is_active) throw new BadRequestException('خدمة السبا غير مفعلة');
    const unitPrice = toNum(service.price);
    const invoiceDate = body.invoiceDate ? String(body.invoiceDate) : localDateString();
    const paymentMethod = this.paymentMethod(body.paymentMethod);

    const row = await this.prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const invoiceNumber = await nextNumber(tx, 'club_spa_invoices', 'invoice_number', `SPINV-${year}`);
      const wantsBenefit = body.useSubscriptionBenefit === true;
      const subscriptionId =
        wantsBenefit
          ? await this.consumeBenefit(tx, Number(body.memberId), 'spa', quantity)
          : null;
      if (wantsBenefit && subscriptionId == null) {
        throw new BadRequestException('رصيد SPA في الاشتراك غير كافٍ أو انتهت صلاحيته');
      }
      const covered = subscriptionId != null;
      const totalAmount = covered ? 0 : unitPrice * quantity;
      const status = covered ? 'included' : body.status ? String(body.status) : 'paid';
      const invoice = await tx.club_spa_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          member_id: Number(body.memberId),
          service_id: Number(body.serviceId),
          branch_id: Number(body.branchId),
          quantity,
          unit_price: unitPrice,
          total_amount: totalAmount,
          invoice_date: invoiceDate,
          status,
          payment_method: covered ? null : paymentMethod,
          subscription_id: subscriptionId,
          covered_by_subscription: covered,
          created_by: userId ?? null,
        },
        include: { service: { select: { id: true, name: true } } },
      });

      if (status === 'paid') {
        await this.ledger.postPayment(
          {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            memberId: invoice.member_id,
            amount: totalAmount,
            branchId: invoice.branch_id,
            invoiceDate,
            paymentMethod,
            createdBy: userId,
            description: `فاتورة SPA ${invoice.invoice_number}`,
          },
          tx,
        );
        await recordSystemRevenue(tx, {
          sourceModule: 'spa_invoice',
          sourceRef: invoice.invoice_number,
          date: invoiceDate,
          source: 'خدمات SPA',
          subSource: service.name,
          amount: totalAmount,
          description: `فاتورة SPA ${invoice.invoice_number}`,
          invoiceNumber: invoice.invoice_number,
          branchId: invoice.branch_id,
          createdBy: userId,
          paymentMethod,
        });
      }

      return invoice;
    });

    return this.mapSpaInvoice(row);
  }

  async updateSpaInvoice(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findSpaInvoice(id, user);
    if (user && body.branchId != null) this.branchScope.assertBranchAllowed(user, Number(body.branchId));
    if (existing.coveredBySubscription) {
      throw new BadRequestException('لا يمكن تعديل فاتورة تم خصمها من الاشتراك');
    }
    const quantity = body.quantity != null ? Number(body.quantity) : existing.quantity;
    const unitPrice = body.unitPrice != null ? Number(body.unitPrice) : existing.unitPrice;
    const totalAmount = unitPrice * quantity;
    const nextStatus = body.status != null ? String(body.status) : existing.status;
    const wasPaid = existing.status === 'paid';
    const willBePaid = nextStatus === 'paid';

    // Amount on a paid invoice is locked in the GL — forbid changing qty/price (reverse+repost
    // is out of scope here).
    if (wasPaid && (quantity !== existing.quantity || unitPrice !== existing.unitPrice)) {
      throw new BadRequestException('لا يمكن تعديل فاتورة مدفوعة');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_spa_invoices.update({
        where: { id },
        data: {
          ...(body.memberId != null ? { member_id: Number(body.memberId) } : {}),
          ...(body.serviceId != null ? { service_id: Number(body.serviceId) } : {}),
          ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
          quantity,
          unit_price: unitPrice,
          total_amount: totalAmount,
          ...(body.invoiceDate != null ? { invoice_date: String(body.invoiceDate) } : {}),
          ...(body.status != null ? { status: nextStatus } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
        include: { service: { select: { id: true, name: true } } },
      });

      // On the unpaid→paid transition, post the GL payment. Idempotent per invoice number.
      if (!wasPaid && willBePaid) {
        await this.ledger.postPayment(
          {
            invoiceId: updated.id,
            invoiceNumber: updated.invoice_number,
            memberId: updated.member_id,
            amount: toNum(updated.total_amount),
            branchId: updated.branch_id,
            description: `فاتورة SPA ${updated.invoice_number}`,
          },
          tx,
        );
      }

      return updated;
    });
    return this.mapSpaInvoice(row);
  }

  async removeSpaInvoice(id: number, user?: JwtUser) {
    const existing = await this.findSpaInvoice(id, user);
    // A paid invoice has a GL entry; block soft-delete so revenue never orphans (GL reversal on
    // delete is out of scope here).
    if (existing.status === 'paid' || existing.coveredBySubscription) {
      throw new BadRequestException('لا يمكن حذف فاتورة مدفوعة أو مستخدمة من الاشتراك');
    }
    await this.prisma.club_spa_invoices.update({
      where: { id },
      data: { is_active: false },
    });
    return { success: true };
  }


  // --- InBody services catalog (single price + packages per branch) ---

  private mapInbodyService(r: {
    id: number;
    name: string;
    description: string | null;
    price: Prisma.Decimal;
    measurement_count: number;
    validity_days: number | null;
    branch_id: number | null;
    is_active: boolean;
  }) {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      price: toNum(r.price),
      measurementCount: r.measurement_count,
      validityDays: r.validity_days,
      branchId: r.branch_id,
      isActive: r.is_active,
    };
  }

  async listInbodyServicesCatalog() {
    const rows = await this.prisma.club_inbody_services.findMany({
      where: { is_active: true },
      orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: toNum(r.price),
      measurementCount: r.measurement_count,
      validityDays: r.validity_days,
      branchId: r.branch_id,
    }));
  }

  async listInbodyServices(q: ListClubFitnessDto) {
    const where: Prisma.club_inbody_servicesWhereInput = {};
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    if (q.search?.trim()) where.name = { contains: q.search.trim() };
    const [rows, total] = await Promise.all([
      this.prisma.club_inbody_services.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_inbody_services.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapInbodyService(r)), total, q.page, q.pageSize);
  }

  async findInbodyService(id: number) {
    const row = await this.prisma.club_inbody_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة InBody غير موجودة');
    return { ...this.mapInbodyService(row), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  /** Branch of a price/package must be inside the user's operating branches (null = all). */
  private async assertInbodyBranchAccess(branchId: number | null, user?: JwtUser) {
    if (!user) return;
    const branches = await clubOperationBranchIds(this.branchScope, this.branchGroups, user);
    if (branches === null) return;
    if (branchId == null || !branches.includes(branchId)) {
      throw new ForbiddenException('لا تملك صلاحية إعدادات InBody لهذا الفرع');
    }
  }

  async createInbodyService(body: Record<string, unknown>, user?: JwtUser) {
    const offer = validateInbodyOffer({ ...body, measurementCount: body.measurementCount ?? 1 });
    const branchId = body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null;
    await this.assertInbodyBranchAccess(branchId, user);
    const row = await this.prisma.club_inbody_services.create({
      data: {
        name: offer.name,
        description: body.description ? String(body.description) : null,
        price: offer.price,
        measurement_count: offer.measurementCount,
        validity_days: offer.validityDays,
        branch_id: branchId,
        is_active: body.isActive !== false,
      },
    });
    return this.findInbodyService(row.id);
  }

  async updateInbodyService(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findInbodyService(id);
    await this.assertInbodyBranchAccess(existing.branchId, user);
    const offer = validateInbodyOffer({
      name: body.name ?? existing.name,
      price: body.price ?? existing.price,
      measurementCount: body.measurementCount ?? existing.measurementCount,
      validityDays: body.validityDays !== undefined ? body.validityDays : existing.validityDays,
    });
    const branchId = body.branchId !== undefined
      ? (body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null)
      : existing.branchId;
    if (branchId !== existing.branchId) await this.assertInbodyBranchAccess(branchId, user);
    await this.prisma.club_inbody_services.update({
      where: { id },
      data: {
        name: offer.name,
        price: offer.price,
        measurement_count: offer.measurementCount,
        validity_days: offer.validityDays,
        branch_id: branchId,
        ...(body.description !== undefined
          ? { description: body.description ? String(body.description) : null }
          : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findInbodyService(id);
  }

  /** Stops the price/package for new sales; balances bought earlier keep working. */
  async removeInbodyService(id: number, user?: JwtUser) {
    const existing = await this.findInbodyService(id);
    await this.assertInbodyBranchAccess(existing.branchId, user);
    await this.prisma.club_inbody_services.update({ where: { id }, data: { is_active: false } });
    return { success: true };
  }

  // --- InBody branch settings («قياسات الأعضاء» ← الإعدادات) ---

  async getInbodyBranchSettings(branchId: number, user?: JwtUser) {
    if (!Number.isSafeInteger(branchId) || branchId <= 0) throw new BadRequestException('الفرع مطلوب');
    await this.assertInbodyBranchAccess(branchId, user);
    const [settings, offers, globalOffers] = await Promise.all([
      this.prisma.club_inbody_branch_settings.findUnique({ where: { branch_id: branchId } }),
      this.prisma.club_inbody_services.findMany({
        where: { branch_id: branchId },
        orderBy: [{ is_active: 'desc' }, { measurement_count: 'asc' }, { price: 'asc' }],
      }),
      this.prisma.club_inbody_services.findMany({
        where: { branch_id: null, is_active: true },
        orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }],
      }),
    ]);
    return {
      branchId,
      // No row yet = the branch keeps Noamany's previous behaviour (selling is allowed).
      allowWithoutActiveMembership: settings?.allow_without_active_membership ?? true,
      offers: offers.map((offer) => this.mapInbodyService(offer)),
      // Old «كل الفروع» prices: used by a branch until it sets its own price/packages.
      globalOffers: globalOffers.map((offer) => this.mapInbodyService(offer)),
    };
  }

  async updateInbodyBranchSettings(branchId: number, body: Record<string, unknown>, user?: JwtUser) {
    if (!Number.isSafeInteger(branchId) || branchId <= 0) throw new BadRequestException('الفرع مطلوب');
    await this.assertInbodyBranchAccess(branchId, user);
    if (typeof body.allowWithoutActiveMembership !== 'boolean') {
      throw new BadRequestException('قيمة السماح بالبيع بدون اشتراك غير صحيحة');
    }
    await this.prisma.club_inbody_branch_settings.upsert({
      where: { branch_id: branchId },
      create: { branch_id: branchId, allow_without_active_membership: body.allowWithoutActiveMembership },
      update: { allow_without_active_membership: body.allowWithoutActiveMembership },
    });
    return this.getInbodyBranchSettings(branchId, user);
  }

  /** Throws when the branch forbids selling InBody to a member with no active gym subscription. */
  private async assertInbodySaleAllowed(tx: Prisma.TransactionClient, memberId: number, branchId: number) {
    const today = localDateString();
    const activeMemberships = await tx.club_subscriptions.count({
      where: {
        member_id: memberId,
        status: 'active',
        subscription_start_date: { lte: today },
        subscription_end_date: { gte: today },
      },
    });
    if (activeMemberships > 0) return;
    const settings = await tx.club_inbody_branch_settings.findUnique({ where: { branch_id: branchId } });
    if (settings && !settings.allow_without_active_membership) {
      throw new BadRequestException('بيع InBody بدون اشتراك جيم فعّال غير مسموح في هذا الفرع');
    }
  }

  /** Active prices/packages of a branch; falls back to the global (branch-less) price list. */
  private async inbodyOffersForBranch(db: Prisma.TransactionClient | PrismaService, branchId: number) {
    const own = await db.club_inbody_services.findMany({
      where: { branch_id: branchId, is_active: true },
      orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }],
    });
    if (own.length) return own;
    return db.club_inbody_services.findMany({
      where: { branch_id: null, is_active: true },
      orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }],
    });
  }

  // --- Member InBody balance (subscription allowance + purchased packages) ---

  async getInbodyMemberContext(memberCode: string, user?: JwtUser) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
    await this.assertInbodyMemberAccess(member.id, user);
    const today = localDateString();
    const [subscriptions, purchased, offers, settings] = await Promise.all([
      this.activeBenefits(member.id),
      this.prisma.club_inbody_entitlements.findMany({
        where: {
          member_id: member.id,
          is_active: true,
          OR: [{ expires_at: null }, { expires_at: { gte: today } }],
        },
      }),
      this.inbodyOffersForBranch(this.prisma, member.branch_id),
      this.prisma.club_inbody_branch_settings.findUnique({ where: { branch_id: member.branch_id } }),
    ]);
    const serviceNames = new Map(
      (await this.prisma.club_inbody_services.findMany({
        where: { id: { in: purchased.map((row) => row.service_id) } },
        select: { id: true, name: true },
      })).map((row) => [row.id, row.name]),
    );
    const balances = sortInbodyEntitlements([
      ...subscriptions
        .filter((row) => Number(row.type?.inbody_count ?? 0) > row.inbody_used)
        .map((row) => ({
          id: row.id,
          source: 'subscription' as const,
          label: `اشتراك ${row.subscription_number}`,
          remaining: Math.max(0, Number(row.type?.inbody_count ?? 0) - row.inbody_used),
          expiresAt: row.subscription_end_date as string | null,
        })),
      ...purchased
        .filter((row) => row.total_count > row.used_count)
        .map((row) => ({
          id: row.id,
          source: 'package' as const,
          label: serviceNames.get(row.service_id) ?? 'باقة InBody',
          remaining: Math.max(0, row.total_count - row.used_count),
          expiresAt: row.expires_at,
        })),
    ]);
    return {
      member: { id: member.id, memberCode: member.member_code, name: member.name, branchId: member.branch_id },
      totalRemaining: balances.reduce((sum, balance) => sum + balance.remaining, 0),
      hasActiveMembership: subscriptions.length > 0,
      allowWithoutActiveMembership: settings?.allow_without_active_membership ?? true,
      balances,
      offers: offers.map((offer) => this.mapInbodyService(offer)),
    };
  }

  /** Consumes one measurement from the balance that expires first (subscription or package). */
  private async consumeNearestInbodyBalance(tx: Prisma.TransactionClient, memberId: number) {
    const today = localDateString();
    await tx.$queryRaw`
      SELECT id FROM club_subscriptions
      WHERE member_id = ${memberId} AND status = 'active'
        AND subscription_start_date <= ${today} AND subscription_end_date >= ${today}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM club_inbody_entitlements
      WHERE member_id = ${memberId} AND is_active = true
        AND (expires_at IS NULL OR expires_at >= ${today})
      FOR UPDATE
    `;
    const [subscriptions, purchased] = await Promise.all([
      tx.club_subscriptions.findMany({
        where: {
          member_id: memberId,
          status: 'active',
          subscription_start_date: { lte: today },
          subscription_end_date: { gte: today },
        },
        include: { type: true },
      }),
      tx.club_inbody_entitlements.findMany({
        where: { member_id: memberId, is_active: true, OR: [{ expires_at: null }, { expires_at: { gte: today } }] },
      }),
    ]);
    const candidates = sortInbodyEntitlements([
      ...subscriptions
        .filter((row) => Number(row.type?.inbody_count ?? 0) > row.inbody_used)
        .map((row) => ({ id: row.id, source: 'subscription' as const, expiresAt: row.subscription_end_date as string | null, used: row.inbody_used })),
      ...purchased
        .filter((row) => row.total_count > row.used_count)
        .map((row) => ({ id: row.id, source: 'package' as const, expiresAt: row.expires_at, used: row.used_count })),
    ]);
    const selected = candidates[0];
    if (!selected) return null;
    const claimed = selected.source === 'subscription'
      ? await tx.club_subscriptions.updateMany({
          where: { id: selected.id, inbody_used: selected.used },
          data: { inbody_used: { increment: 1 } },
        })
      : await tx.club_inbody_entitlements.updateMany({
          where: { id: selected.id, used_count: selected.used },
          data: { used_count: { increment: 1 } },
        });
    if (claimed.count !== 1) throw new ConflictException('تم تغيير رصيد InBody أثناء العملية، أعد المحاولة');
    return {
      source: selected.source,
      subscriptionId: selected.source === 'subscription' ? selected.id : null,
      entitlementId: selected.source === 'package' ? selected.id : null,
    };
  }

  /**
   * Records a measurement the Gymora way: deducts one from the member's nearest-expiring balance
   * (subscription allowance or a purchased package); with no balance — or `settle: 'paid'` — it
   * sells the chosen price/package (invoice + GL + revenue) and consumes one from what was bought.
   */
  async recordInbodyMeasurement(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.memberId || !body.measurementDate) throw new BadRequestException('العضو وتاريخ القياس مطلوبان');
    const memberId = Number(body.memberId);
    const measurementDate = String(body.measurementDate);
    const reportUrl = typeof body.reportUrl === 'string' && body.reportUrl.trim() ? body.reportUrl.trim() : null;
    if (reportUrl && reportUrl.length > 500) throw new BadRequestException('مسار تقرير InBody طويل جدًا');
    const payNow = body.settle === 'paid';
    const member = await assertMemberExists(this.prisma, memberId);
    await this.assertInbodyMemberAccess(memberId, user);
    this.assertInbodyDateAccess(measurementDate, user);
    await this.assertUniqueInbodyDay(memberId, measurementDate);
    const memberRow = await this.prisma.club_members.findUnique({ where: { id: memberId }, select: { branch_id: true } });
    const branchId = Number(body.branchId ?? memberRow?.branch_id);
    if (!Number.isSafeInteger(branchId) || branchId <= 0) throw new BadRequestException('الفرع مطلوب');

    return this.prisma.$transaction(async (tx) => {
      let balance = payNow ? null : await this.consumeNearestInbodyBalance(tx, memberId);
      let settlementSource: string = balance?.source ?? 'paid_single';
      let invoiceId: number | null = null;
      let invoiceNumber: string | null = null;
      let chargedAmount = 0;
      let serviceName: string | null = null;

      if (!balance) {
        if (body.offerId == null) throw new BadRequestException('اختر سعر القياس أو إحدى باقات InBody');
        const offers = await this.inbodyOffersForBranch(tx, branchId);
        const offer = offers.find((row) => row.id === Number(body.offerId));
        if (!offer) throw new NotFoundException('سعر أو باقة InBody غير موجودة لهذا الفرع');
        await this.assertInbodySaleAllowed(tx, memberId, branchId);
        const paymentMethod = this.paymentMethod(body.paymentMethod);
        invoiceNumber = await nextNumber(tx, 'club_inbody_invoices', 'invoice_number', `INB-${new Date().getFullYear()}`);
        chargedAmount = toNum(offer.price);
        serviceName = offer.name;
        const invoice = await tx.club_inbody_invoices.create({
          data: {
            invoice_number: invoiceNumber,
            is_member: true,
            member_id: memberId,
            customer_name: null,
            service_id: offer.id,
            branch_id: branchId,
            unit_price: chargedAmount,
            total_amount: chargedAmount,
            invoice_date: measurementDate,
            status: 'paid',
            payment_method: paymentMethod,
            covered_by_subscription: false,
            created_by: userId ?? null,
          },
        });
        invoiceId = invoice.id;
        const entitlement = await tx.club_inbody_entitlements.create({
          data: {
            member_id: memberId,
            branch_id: branchId,
            service_id: offer.id,
            invoice_id: invoice.id,
            total_count: Math.max(1, offer.measurement_count),
            used_count: 1,
            purchased_date: measurementDate,
            expires_at: offer.validity_days ? addCalendarDays(measurementDate, offer.validity_days) : null,
          },
        });
        balance = { source: 'package', subscriptionId: null, entitlementId: entitlement.id };
        settlementSource = offer.measurement_count > 1 ? 'package_purchase' : 'paid_single';
        if (chargedAmount > 0) {
          await this.ledger.postPayment(
            {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number,
              memberId,
              amount: chargedAmount,
              branchId,
              invoiceDate: measurementDate,
              paymentMethod,
              createdBy: userId,
              description: `فاتورة InBody ${invoice.invoice_number}`,
            },
            tx,
          );
          await recordSystemRevenue(tx, {
            sourceModule: 'inbody_invoice',
            sourceRef: invoice.invoice_number,
            date: measurementDate,
            source: 'InBody',
            subSource: offer.name,
            amount: chargedAmount,
            description: `تحصيل ${offer.name}`,
            customerName: member.name,
            invoiceNumber: invoice.invoice_number,
            branchId,
            createdBy: userId,
            paymentMethod,
          });
        }
      }

      const measurement = await tx.club_inbody_measurements.create({
        data: {
          member_id: memberId,
          branch_id: branchId,
          measurement_date: measurementDate,
          report_url: reportUrl,
          notes: body.notes ? String(body.notes).trim() : null,
          settlement_source: settlementSource,
          subscription_id: balance?.subscriptionId ?? null,
          entitlement_id: balance?.entitlementId ?? null,
          invoice_id: invoiceId,
          created_by: userId ?? null,
        },
      });
      return { id: measurement.id, branchId, settlementSource, chargedAmount, invoiceNumber, serviceName };
    });
  }
}
