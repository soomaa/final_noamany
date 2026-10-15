import { purchasedBenefits } from '../club-subscriptions/purchased-benefits';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { sortInbodyEntitlements, validateInbodyOffer } from './inbody-entitlements';
import { ClubServiceDebtsService } from '../club-service-debts/club-service-debts.service';

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
    private readonly branchScope: BranchScopeService,
    private readonly debts: ClubServiceDebtsService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private assertCatalogWriteAccess(user: JwtUser | undefined, branchId: number | null) {
    if (branchId == null) {
      if (user && user.level !== 1) {
        throw new ForbiddenException('الخدمات العامة لا يعدلها إلا مدير النظام');
      }
      return;
    }
    this.assertBranchAccess(user, branchId);
  }

  private async assertMemberAccess(memberId: number, user?: JwtUser, expectedBranchId?: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { branch_id: true, name: true, phone: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, member.branch_id);
    if (expectedBranchId != null && member.branch_id !== expectedBranchId) {
      throw new ForbiddenException('لا يمكن استخدام عضو من فرع آخر');
    }
    return member;
  }

  private async allowedMemberIds(user?: JwtUser): Promise<number[] | null> {
    const scope = this.branchScope.allowedBranchIds(user);
    if (scope === null) return null;
    if (scope.length === 0) return [];
    const members = await this.prisma.club_members.findMany({
      where: { branch_id: { in: scope }, is_deleted: false },
      select: { id: true },
    });
    return members.map((member) => member.id);
  }

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
        status: { in: ['active', 'upcoming'] },
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
    this.assertBranchAccess(user, member.branch_id);
    const subscriptions = await this.activeBenefits(member.id);
    const inbody = subscriptions
      .filter((s) => Number(purchasedBenefits(s, s.type).inbody_count ?? 0) > s.inbody_used)
      .map((s) => ({
        subscriptionId: s.id,
        subscriptionNumber: s.subscription_number,
        total: Number(purchasedBenefits(s, s.type).inbody_count ?? 0),
        used: s.inbody_used,
        remaining: Math.max(0, Number(purchasedBenefits(s, s.type).inbody_count ?? 0) - s.inbody_used),
        expiresAt: s.subscription_end_date,
      }));
    const spa = subscriptions
      .filter((s) => purchasedBenefits(s, s.type).includes_spa && Number(purchasedBenefits(s, s.type).spa_count ?? 0) > s.spa_used)
      .map((s) => ({
        subscriptionId: s.id,
        subscriptionNumber: s.subscription_number,
        total: Number(purchasedBenefits(s, s.type).spa_count ?? 0),
        used: s.spa_used,
        remaining: Math.max(0, Number(purchasedBenefits(s, s.type).spa_count ?? 0) - s.spa_used),
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

  async getInbodyMemberContext(memberCode: string, user?: JwtUser) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.findMemberByCode(memberCode);
    this.assertBranchAccess(user, member.branch_id);
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
      this.prisma.club_inbody_services.findMany({
        where: { branch_id: member.branch_id, is_active: true },
        orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }],
      }),
      this.prisma.club_inbody_branch_settings.findUnique({
        where: { branch_id: member.branch_id },
      }),
    ]);
    const offerNames = new Map(offers.map((offer) => [offer.id, offer.name]));
    const balances = sortInbodyEntitlements([
      ...subscriptions
        .filter((row) => Number(purchasedBenefits(row, row.type).inbody_count ?? 0) > row.inbody_used)
        .map((row) => ({
          id: row.id,
          source: 'subscription' as const,
          label: `اشتراك ${row.subscription_number}`,
          remaining: Math.max(0, Number(purchasedBenefits(row, row.type).inbody_count ?? 0) - row.inbody_used),
          expiresAt: row.subscription_end_date,
        })),
      ...purchased
        .filter((row) => row.total_count > row.used_count)
        .map((row) => ({
          id: row.id,
          source: 'package' as const,
          label: offerNames.get(row.service_id) ?? 'باقة InBody',
          remaining: Math.max(0, row.total_count - row.used_count),
          expiresAt: row.expires_at,
        })),
    ]);

    return {
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
        branchId: member.branch_id,
      },
      totalRemaining: balances.reduce((sum, balance) => sum + balance.remaining, 0),
      hasActiveMembership: subscriptions.length > 0,
      allowWithoutActiveMembership: settings?.allow_without_active_membership ?? false,
      balances,
      offers: offers.map((offer) => ({
        id: offer.id,
        name: offer.name,
        price: toNum(offer.price),
        measurementCount: offer.measurement_count,
        validityDays: offer.validity_days,
        branchId: offer.branch_id,
      })),
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
        AND status IN ('active', 'upcoming')
        AND subscription_start_date <= ${today}
        AND subscription_end_date >= ${today}
      ORDER BY subscription_end_date ASC, id ASC
      FOR UPDATE
    `;
    const subscriptions = await tx.club_subscriptions.findMany({
      where: {
        member_id: memberId,
        status: { in: ['active', 'upcoming'] },
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
          ? Number(purchasedBenefits(subscription, subscription.type).inbody_count ?? 0)
          : purchasedBenefits(subscription, subscription.type).includes_spa
            ? Number(purchasedBenefits(subscription, subscription.type).spa_count ?? 0)
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

  private async consumeNearestInbodyBalance(
    tx: Prisma.TransactionClient,
    memberId: number,
  ): Promise<{
    source: 'subscription' | 'package';
    subscriptionId: number | null;
    entitlementId: number | null;
    expiresAt: string | null;
  } | null> {
    const today = localDateString();
    await tx.$queryRaw`
      SELECT id
      FROM club_subscriptions
      WHERE member_id = ${memberId}
        AND status IN ('active', 'upcoming')
        AND subscription_start_date <= ${today}
        AND subscription_end_date >= ${today}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id
      FROM club_inbody_entitlements
      WHERE member_id = ${memberId}
        AND is_active = true
        AND (expires_at IS NULL OR expires_at >= ${today})
      FOR UPDATE
    `;

    const [subscriptions, purchased] = await Promise.all([
      tx.club_subscriptions.findMany({
        where: {
          member_id: memberId,
          status: { in: ['active', 'upcoming'] },
          subscription_start_date: { lte: today },
          subscription_end_date: { gte: today },
        },
        include: { type: true },
      }),
      tx.club_inbody_entitlements.findMany({
        where: {
          member_id: memberId,
          is_active: true,
          OR: [{ expires_at: null }, { expires_at: { gte: today } }],
        },
      }),
    ]);

    const candidates = sortInbodyEntitlements([
      ...subscriptions
        .filter((row) => Number(purchasedBenefits(row, row.type).inbody_count ?? 0) > row.inbody_used)
        .map((row) => ({
          id: row.id,
          source: 'subscription' as const,
          expiresAt: row.subscription_end_date,
          used: row.inbody_used,
        })),
      ...purchased
        .filter((row) => row.total_count > row.used_count)
        .map((row) => ({
          id: row.id,
          source: 'package' as const,
          expiresAt: row.expires_at,
          used: row.used_count,
        })),
    ]);

    const selected = candidates[0];
    if (!selected) return null;
    if (selected.source === 'subscription') {
      const claimed = await tx.club_subscriptions.updateMany({
        where: { id: selected.id, inbody_used: selected.used },
        data: { inbody_used: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('تم تغيير رصيد InBody أثناء العملية، أعد المحاولة');
      }
      return {
        source: 'subscription',
        subscriptionId: selected.id,
        entitlementId: null,
        expiresAt: selected.expiresAt,
      };
    }

    const claimed = await tx.club_inbody_entitlements.updateMany({
      where: { id: selected.id, used_count: selected.used },
      data: { used_count: { increment: 1 } },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('تم تغيير رصيد InBody أثناء العملية، أعد المحاولة');
    }
    return {
      source: 'package',
      subscriptionId: null,
      entitlementId: selected.id,
      expiresAt: selected.expiresAt,
    };
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
      branch_id: number | null;
      measurement_date: string;
      weight: Prisma.Decimal | null;
      height_cm: Prisma.Decimal | null;
      body_fat: Prisma.Decimal | null;
      muscle_mass: Prisma.Decimal | null;
      bmi: Prisma.Decimal | null;
      notes: string | null;
      report_url: string | null;
      settlement_source: string;
      subscription_id: number | null;
      entitlement_id: number | null;
      invoice_id: number | null;
      created_by: number | null;
      created_at: Date;
      updated_at: Date;
    },
    memberMap: Map<number, import('../club-members/club-member-brief.utils').MemberBrief>,
  ) {
    return {
      id: row.id,
      memberId: row.member_id,
      branchId: row.branch_id,
      ...attachMemberBrief(row.member_id, memberMap),
      measurementDate: row.measurement_date,
      weight: row.weight != null ? toNum(row.weight) : null,
      heightCm: row.height_cm != null ? toNum(row.height_cm) : null,
      bodyFat: row.body_fat != null ? toNum(row.body_fat) : null,
      muscleMass: row.muscle_mass != null ? toNum(row.muscle_mass) : null,
      bmi: row.bmi != null ? toNum(row.bmi) : null,
      notes: row.notes,
      reportUrl: row.report_url,
      settlementSource: row.settlement_source,
      subscriptionId: row.subscription_id,
      entitlementId: row.entitlement_id,
      invoiceId: row.invoice_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- InBody measurements ---

  async listInbodyMeasurements(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_inbody_measurementsWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);

    if (q.search?.trim()) {
      const memberIds = await searchMemberIds(this.prisma, q.search);
      if (memberIds.length === 0) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.member_id = { in: memberIds };
    }
    const scopedMemberIds = await this.allowedMemberIds(user);
    if (scopedMemberIds !== null) {
      const requestedIds =
        typeof where.member_id === 'number'
          ? [where.member_id]
          : where.member_id && typeof where.member_id === 'object' && 'in' in where.member_id
            ? (where.member_id.in ?? [])
            : null;
      where.member_id = {
        in: requestedIds == null
          ? scopedMemberIds
          : requestedIds.filter((id) => scopedMemberIds.includes(Number(id))).map(Number),
      };
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

  async findInbodyMeasurement(id: number, user?: JwtUser) {
    const row = await this.prisma.club_inbody_measurements.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قياس InBody غير موجود');
    await this.assertMemberAccess(row.member_id, user);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return this.mapInbodyMeasurement(row, memberMap);
  }

  async createInbodyMeasurement(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.memberId || !body.measurementDate) {
      throw new BadRequestException('كود العضو وتاريخ القياس مطلوبان');
    }
    await this.assertMemberAccess(Number(body.memberId), user);
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

  async recordInbodyMeasurement(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.memberId || !body.branchId || !body.measurementDate || !body.reportUrl) {
      throw new BadRequestException('العضو والفرع وتاريخ القياس وتقرير InBody مطلوبة');
    }
    const memberId = Number(body.memberId);
    const branchId = Number(body.branchId);
    const measurementDate = String(body.measurementDate);
    const reportUrl = String(body.reportUrl).trim();
    if (!reportUrl) throw new BadRequestException('تقرير InBody مطلوب');
    const member = await this.assertMemberAccess(memberId, user, branchId);
    await this.assertUniqueInbodyDay(memberId, measurementDate);

    return this.prisma.$transaction(async (tx) => {
      let balance = await this.consumeNearestInbodyBalance(tx, memberId);
      let invoiceId: number | null = null;
      let chargedAmount = 0;
      let settlementSource = balance?.source ?? 'paid_single';
      let invoiceNumber: string | null = null;
      let serviceName: string | null = null;
      let receiptPaymentMethod: string | null = null;
      let paidAmount = 0;
      let remainingAmount = 0;
      let receiptPayments: { method: string; amount: number }[] = [];

      if (!balance) {
        if (body.offerId == null) {
          throw new BadRequestException('اختر سعر القياس أو إحدى باقات InBody');
        }
        const offer = await tx.club_inbody_services.findFirst({
          where: {
            id: Number(body.offerId),
            branch_id: branchId,
            is_active: true,
          },
        });
        if (!offer) throw new NotFoundException('سعر أو باقة InBody غير موجودة لهذا الفرع');

        const today = localDateString();
        const activeMemberships = await tx.club_subscriptions.count({
          where: {
            member_id: memberId,
            status: { in: ['active', 'upcoming'] },
            subscription_start_date: { lte: today },
            subscription_end_date: { gte: today },
          },
        });
        if (activeMemberships === 0) {
          const settings = await tx.club_inbody_branch_settings.findUnique({
            where: { branch_id: branchId },
          });
          if (!settings?.allow_without_active_membership) {
            throw new BadRequestException('بيع InBody بدون اشتراك جيم فعّال غير مسموح في هذا الفرع');
          }
        }

        const paymentMethod = this.paymentMethod(body.paymentMethod);
        const year = new Date().getFullYear();
        invoiceNumber = await nextNumber(
          tx,
          'club_inbody_invoices',
          'invoice_number',
          `INB-${year}`,
        );
        chargedAmount = toNum(offer.price);
        paidAmount = body.paidAmount == null ? chargedAmount : Number(body.paidAmount);
        if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > chargedAmount) {
          throw new BadRequestException('المبلغ المدفوع يجب أن يكون بين صفر وسعر القياس أو الباقة');
        }
        remainingAmount = Math.round((chargedAmount - paidAmount) * 100) / 100;
        serviceName = offer.name;
        receiptPaymentMethod = paymentMethod;
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
            paid_amount: paidAmount,
            remaining_amount: remainingAmount,
            invoice_date: measurementDate,
            status: remainingAmount > 0 ? (paidAmount > 0 ? 'partial' : 'unpaid') : 'paid',
            payment_method: paymentMethod,
            covered_by_subscription: false,
            created_by: userId ?? null,
          },
        });
        invoiceId = invoice.id;
        const sale = await this.debts.recordSale({
          sourceType: 'inbody',
          sourceRef: invoice.invoice_number,
          branchId,
          memberId,
          customerName: member.name,
          customerPhone: member.phone,
          totalAmount: chargedAmount,
          paidAmount,
          paymentMethod,
          payments: Array.isArray(body.payments) ? body.payments as { method: string; amount: number }[] : undefined,
          transactionDate: measurementDate,
          description: `تحصيل InBody ${invoice.invoice_number}`,
          createdBy: userId,
        }, tx);
        receiptPaymentMethod = sale.payments?.[0]?.method ?? paymentMethod;
        receiptPayments = sale.payments;
        const entitlement = await tx.club_inbody_entitlements.create({
          data: {
            member_id: memberId,
            branch_id: branchId,
            service_id: offer.id,
            invoice_id: invoice.id,
            total_count: offer.measurement_count,
            used_count: 1,
            purchased_date: measurementDate,
            expires_at: offer.validity_days
              ? addCalendarDays(measurementDate, offer.validity_days)
              : null,
          },
        });
        balance = {
          source: 'package',
          subscriptionId: null,
          entitlementId: entitlement.id,
          expiresAt: offer.validity_days
            ? addCalendarDays(measurementDate, offer.validity_days)
            : null,
        };
        settlementSource = offer.measurement_count > 1 ? 'package_purchase' : 'paid_single';

        if (paidAmount > 0) await recordSystemRevenue(tx, {
          sourceModule: 'inbody_invoice',
          sourceRef: invoice.invoice_number,
          date: measurementDate,
          source: 'InBody',
          subSource: offer.name,
          amount: paidAmount,
          description: `تحصيل ${offer.name}`,
          invoiceNumber: invoice.invoice_number,
          branchId,
          createdBy: userId,
          paymentMethod,
        });
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

      return {
        id: measurement.id,
        settlementSource,
        chargedAmount,
        invoiceNumber,
        serviceName,
        paymentMethod: receiptPaymentMethod,
        paidAmount,
        remainingAmount,
        payments: receiptPayments,
      };
    });
  }

  async updateInbodyMeasurement(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findInbodyMeasurement(id, user);
    this.validateInbodyMeasurementValues(body);
    const memberId = body.memberId != null ? Number(body.memberId) : existing.memberId;
    const measurementDate =
      body.measurementDate != null ? String(body.measurementDate) : existing.measurementDate;
    if (body.memberId != null) await this.assertMemberAccess(memberId, user);
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
    paid_amount: Prisma.Decimal;
    remaining_amount: Prisma.Decimal;
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
      paidAmount: toNum(row.paid_amount),
      remainingAmount: toNum(row.remaining_amount),
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
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) where.branch_id = { in: scope };

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
    this.assertBranchAccess(user, row.branch_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapInbodyInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createInbodyInvoice(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.branchId) {
      throw new BadRequestException('الفرع مطلوب');
    }
    const branchId = Number(body.branchId);
    this.assertBranchAccess(user, branchId);
    const isMember = body.isMember !== false;
    if (isMember) {
      if (body.memberId == null) {
        throw new BadRequestException('كود العضو مطلوب لفاتورة العضو');
      }
      await this.assertMemberAccess(Number(body.memberId), user, branchId);
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
          branch_id: branchId,
          unit_price: unitPrice,
          total_amount: totalAmount,
          paid_amount: covered ? 0 : totalAmount,
          remaining_amount: 0,
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

  async updateInbodyInvoice(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.findInbodyInvoice(id, user);
    const branchId = body.branchId != null ? Number(body.branchId) : existing.branchId;
    this.assertBranchAccess(user, branchId);
    if (body.memberId != null) await this.assertMemberAccess(Number(body.memberId), user, branchId);
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

  async listSpaServices(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_spa_servicesWhereInput = {};
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) {
      where.AND = [{ OR: [{ branch_id: null }, { branch_id: { in: scope } }] }];
    }
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

  async listSpaServicesCatalog(user?: JwtUser) {
    const scope = this.branchScope.allowedBranchIds(user);
    const rows = await this.prisma.club_spa_services.findMany({
      where: {
        is_active: true,
        ...(scope !== null ? { OR: [{ branch_id: null }, { branch_id: { in: scope } }] } : {}),
      },
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

  async findSpaService(id: number, user?: JwtUser) {
    const row = await this.prisma.club_spa_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة السبا غير موجودة');
    if (row.branch_id != null) this.assertBranchAccess(user, row.branch_id);
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

  async createSpaService(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.name || body.price == null) {
      throw new BadRequestException('اسم الخدمة والسعر مطلوبان');
    }
    const branchId = body.branchId != null
      ? Number(body.branchId)
      : user && user.level !== 1
        ? Number(user.branch)
        : null;
    this.assertCatalogWriteAccess(user, branchId);
    const row = await this.prisma.club_spa_services.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        duration: body.duration != null ? Number(body.duration) : 60,
        price: Number(body.price),
        branch_id: branchId,
        is_active: body.isActive !== false,
      },
    });
    return this.findSpaService(row.id, user);
  }

  async updateSpaService(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.prisma.club_spa_services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('خدمة السبا غير موجودة');
    this.assertCatalogWriteAccess(user, existing.branch_id);
    if (body.branchId !== undefined) {
      this.assertCatalogWriteAccess(user, body.branchId != null ? Number(body.branchId) : null);
    }
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
    return this.findSpaService(id, user);
  }

  async removeSpaService(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_spa_services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('خدمة السبا غير موجودة');
    this.assertCatalogWriteAccess(user, existing.branch_id);
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
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) where.branch_id = { in: scope };

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
    this.assertBranchAccess(user, row.branch_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaBooking(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaBooking(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.serviceId || !body.branchId || !body.bookingDate || !body.bookingTime) {
      throw new BadRequestException('الخدمة والفرع وتاريخ ووقت الحجز مطلوبة');
    }
    const branchId = Number(body.branchId);
    this.assertBranchAccess(user, branchId);
    if (body.memberId != null) await this.assertMemberAccess(Number(body.memberId), user, branchId);

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
          branch_id: branchId,
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
    const branchId = body.branchId != null ? Number(body.branchId) : existing.branchId;
    this.assertBranchAccess(user, branchId);
    if (body.memberId != null) await this.assertMemberAccess(Number(body.memberId), user, branchId);
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
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) where.branch_id = { in: scope };

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
    this.assertBranchAccess(user, row.branch_id);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return { ...this.mapSpaInvoice(row), ...attachMemberBrief(row.member_id, memberMap) };
  }

  async createSpaInvoice(body: Record<string, unknown>, userId?: number, user?: JwtUser) {
    if (!body.memberId || !body.serviceId || !body.branchId) {
      throw new BadRequestException('العضو والخدمة والفرع مطلوبة');
    }
    const branchId = Number(body.branchId);
    this.assertBranchAccess(user, branchId);
    await this.assertMemberAccess(Number(body.memberId), user, branchId);

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
          branch_id: branchId,
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
    const branchId = body.branchId != null ? Number(body.branchId) : existing.branchId;
    this.assertBranchAccess(user, branchId);
    if (body.memberId != null) await this.assertMemberAccess(Number(body.memberId), user, branchId);
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

  // --- InBody services catalog ---

  async listInbodyServicesCatalog(user?: JwtUser) {
    const scope = this.branchScope.allowedBranchIds(user);
    const rows = await this.prisma.club_inbody_services.findMany({
      where: {
        is_active: true,
        ...(scope !== null ? { OR: [{ branch_id: null }, { branch_id: { in: scope } }] } : {}),
      },
      orderBy: { name: 'asc' },
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

  async listInbodyServices(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_inbody_servicesWhereInput = {};
    if (q.branch && q.branch !== 'all') where.branch_id = Number(q.branch);
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) where.AND = [{ OR: [{ branch_id: null }, { branch_id: { in: scope } }] }];
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
        measurementCount: r.measurement_count,
        validityDays: r.validity_days,
        branchId: r.branch_id,
        isActive: r.is_active,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findInbodyService(id: number, user?: JwtUser) {
    const row = await this.prisma.club_inbody_services.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('خدمة InBody غير موجودة');
    if (row.branch_id != null) this.assertBranchAccess(user, row.branch_id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price: toNum(row.price),
      measurementCount: row.measurement_count,
      validityDays: row.validity_days,
      branchId: row.branch_id,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createInbodyService(body: Record<string, unknown>, user?: JwtUser) {
    const offer = validateInbodyOffer(body);
    const branchId = body.branchId != null
      ? Number(body.branchId)
      : user && user.level !== 1
        ? Number(user.branch)
        : null;
    this.assertCatalogWriteAccess(user, branchId);
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
    return this.findInbodyService(row.id, user);
  }

  async updateInbodyService(id: number, body: Record<string, unknown>, user?: JwtUser) {
    const existing = await this.prisma.club_inbody_services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('خدمة InBody غير موجودة');
    this.assertCatalogWriteAccess(user, existing.branch_id);
    if (body.branchId !== undefined) {
      this.assertCatalogWriteAccess(user, body.branchId != null ? Number(body.branchId) : null);
    }
    const offer = validateInbodyOffer({
      name: body.name ?? existing.name,
      measurementCount: body.measurementCount ?? existing.measurement_count,
      price: body.price ?? toNum(existing.price),
      validityDays: body.validityDays !== undefined ? body.validityDays : existing.validity_days,
    });
    await this.prisma.club_inbody_services.update({
      where: { id },
      data: {
        name: offer.name,
        ...(body.description !== undefined
          ? { description: body.description ? String(body.description) : null }
          : {}),
        price: offer.price,
        measurement_count: offer.measurementCount,
        validity_days: offer.validityDays,
        ...(body.branchId !== undefined
          ? { branch_id: body.branchId != null ? Number(body.branchId) : null }
          : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findInbodyService(id, user);
  }

  async removeInbodyService(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_inbody_services.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('خدمة InBody غير موجودة');
    this.assertCatalogWriteAccess(user, existing.branch_id);
    await this.prisma.club_inbody_services.update({ where: { id }, data: { is_active: false } });
    return { success: true };
  }

  async getInbodyBranchSettings(branchId: number, user?: JwtUser) {
    this.assertBranchAccess(user, branchId);
    const [settings, offers] = await Promise.all([
      this.prisma.club_inbody_branch_settings.findUnique({ where: { branch_id: branchId } }),
      this.prisma.club_inbody_services.findMany({
        where: { branch_id: branchId },
        orderBy: [{ measurement_count: 'asc' }, { price: 'asc' }],
      }),
    ]);
    return {
      branchId,
      allowWithoutActiveMembership: settings?.allow_without_active_membership ?? false,
      offers: offers.map((offer) => ({
        id: offer.id,
        name: offer.name,
        description: offer.description,
        price: toNum(offer.price),
        measurementCount: offer.measurement_count,
        validityDays: offer.validity_days,
        branchId: offer.branch_id,
        isActive: offer.is_active,
      })),
    };
  }

  async updateInbodyBranchSettings(
    branchId: number,
    body: Record<string, unknown>,
    user?: JwtUser,
  ) {
    this.assertBranchAccess(user, branchId);
    const row = await this.prisma.club_inbody_branch_settings.upsert({
      where: { branch_id: branchId },
      create: {
        branch_id: branchId,
        allow_without_active_membership: body.allowWithoutActiveMembership === true,
      },
      update: {
        allow_without_active_membership: body.allowWithoutActiveMembership === true,
      },
    });
    return {
      branchId: row.branch_id,
      allowWithoutActiveMembership: row.allow_without_active_membership,
    };
  }
}

