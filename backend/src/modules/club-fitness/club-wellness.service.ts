import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SalesPaymentMethod } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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

@Injectable()
export class ClubWellnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ClubFitnessLedgerService,
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

  async getMemberBenefits(memberCode: string) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
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

  async checkInSpaByBarcode(memberCode: string, userId?: number) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
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
          branch_id: member.branch_id,
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
      created_at: Date;
      updated_at: Date;
    },
    memberMap: Map<number, import('../club-members/club-member-brief.utils').MemberBrief>,
  ) {
    return {
      id: row.id,
      memberId: row.member_id,
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

  async listInbodyMeasurements(q: ListClubFitnessDto) {
    const where: Prisma.club_inbody_measurementsWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.dateFrom || q.dateTo) {
      where.measurement_date = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    }

    if (q.search?.trim()) {
      const memberIds = await searchMemberIds(this.prisma, q.search);
      if (memberIds.length === 0) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.member_id = { in: memberIds };
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

  /** SPA barcode visits are distinct from paid SPA invoices and are reportable by date/branch. */
  async listSpaAttendance(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_attendanceWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
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

  async findInbodyMeasurement(id: number) {
    const row = await this.prisma.club_inbody_measurements.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قياس InBody غير موجود');
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return this.mapInbodyMeasurement(row, memberMap);
  }

  async createInbodyMeasurement(body: Record<string, unknown>) {
    if (!body.memberId || !body.measurementDate) {
      throw new BadRequestException('كود العضو وتاريخ القياس مطلوبان');
    }
    await assertMemberExists(this.prisma, Number(body.memberId));
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
    return this.findInbodyMeasurement(row.id);
  }

  async updateInbodyMeasurement(id: number, body: Record<string, unknown>) {
    const existing = await this.findInbodyMeasurement(id);
    this.validateInbodyMeasurementValues(body);
    const memberId = body.memberId != null ? Number(body.memberId) : existing.memberId;
    const measurementDate =
      body.measurementDate != null ? String(body.measurementDate) : existing.measurementDate;
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
    return this.findInbodyMeasurement(id);
  }

  async removeInbodyMeasurement(id: number) {
    await this.findInbodyMeasurement(id);
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

  async listInbodyInvoices(q: ListClubFitnessDto) {
    const where: Prisma.club_inbody_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

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

  async findInbodyInvoice(id: number) {
    const row = await this.prisma.club_inbody_invoices.findFirst({
      where: { id, is_active: true },
    });
    if (!row) throw new NotFoundException('فاتورة InBody غير موجودة');
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapInbodyInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createInbodyInvoice(body: Record<string, unknown>, userId?: number) {
    if (!body.branchId) {
      throw new BadRequestException('الفرع مطلوب');
    }
    const isMember = body.isMember !== false;
    if (isMember) {
      if (body.memberId == null) {
        throw new BadRequestException('كود العضو مطلوب لفاتورة العضو');
      }
      await assertMemberExists(this.prisma, Number(body.memberId));
    }

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

  async updateInbodyInvoice(id: number, body: Record<string, unknown>) {
    const existing = await this.findInbodyInvoice(id);
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

  async removeInbodyInvoice(id: number) {
    const existing = await this.findInbodyInvoice(id);
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

  async listSpaBookings(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_bookingsWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

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

  async findSpaBooking(id: number) {
    const row = await this.prisma.club_spa_bookings.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true, price: true, duration: true } } },
    });
    if (!row) throw new NotFoundException('حجز السبا غير موجود');
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaBooking(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaBooking(body: Record<string, unknown>) {
    if (!body.serviceId || !body.branchId || !body.bookingDate || !body.bookingTime) {
      throw new BadRequestException('الخدمة والفرع وتاريخ ووقت الحجز مطلوبة');
    }
    if (body.memberId != null) {
      await assertMemberExists(this.prisma, Number(body.memberId));
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

  async updateSpaBooking(id: number, body: Record<string, unknown>) {
    const existing = await this.findSpaBooking(id);
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

  async removeSpaBooking(id: number) {
    await this.findSpaBooking(id);
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

  async listSpaInvoices(q: ListClubFitnessDto) {
    const where: Prisma.club_spa_invoicesWhereInput = { is_active: true };
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);

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

  async findSpaInvoice(id: number) {
    const row = await this.prisma.club_spa_invoices.findFirst({
      where: { id, is_active: true },
      include: { service: { select: { id: true, name: true } } },
    });
    if (!row) throw new NotFoundException('فاتورة السبا غير موجودة');
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaInvoice(body: Record<string, unknown>, userId?: number) {
    if (!body.memberId || !body.serviceId || !body.branchId) {
      throw new BadRequestException('العضو والخدمة والفرع مطلوبة');
    }
    await assertMemberExists(this.prisma, Number(body.memberId));

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

  async updateSpaInvoice(id: number, body: Record<string, unknown>) {
    const existing = await this.findSpaInvoice(id);
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

  async removeSpaInvoice(id: number) {
    const existing = await this.findSpaInvoice(id);
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

  // --- InBody services catalog ---

  async listInbodyServicesCatalog() {
    const rows = await this.prisma.club_inbody_services.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: toNum(r.price),
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
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        price: toNum(r.price),
        branchId: r.branch_id,
        isActive: r.is_active,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findInbodyService(id: number) {
    const row = await this.prisma.club_inbody_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة InBody غير موجودة');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: toNum(row.price),
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createInbodyService(body: Record<string, unknown>) {
    if (!body.name || body.price == null) {
      throw new BadRequestException('اسم الخدمة والسعر مطلوبان');
    }
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('السعر غير صحيح');
    const row = await this.prisma.club_inbody_services.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        price,
        branch_id: body.branchId != null ? Number(body.branchId) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.findInbodyService(row.id);
  }

  async updateInbodyService(id: number, body: Record<string, unknown>) {
    await this.findInbodyService(id);
    if (body.price != null && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) {
      throw new BadRequestException('السعر غير صحيح');
    }
    await this.prisma.club_inbody_services.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description ? String(body.description) : null }
          : {}),
        ...(body.price != null ? { price: Number(body.price) } : {}),
        ...(body.branchId !== undefined
          ? { branch_id: body.branchId != null ? Number(body.branchId) : null }
          : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findInbodyService(id);
  }

  async removeInbodyService(id: number) {
    await this.findInbodyService(id);
    await this.prisma.club_inbody_services.update({ where: { id }, data: { is_active: false } });
    return { success: true };
  }
}
