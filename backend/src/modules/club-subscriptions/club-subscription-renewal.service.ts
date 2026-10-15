import { captureBenefits } from './purchased-benefits';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ClubPaymentMethod, Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { ClubDiscountCodesService, ResolvedClubDiscount } from './club-discount-codes.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionLifecycleService, RenewalChainNode } from './club-subscription-lifecycle.service';
import { loadBranchPricesForType } from './club-subscription-branch-prices.loader';
import {
  addDays,
  daysBetween,
  resolveClubPayments,
  resolveSessionMatrixPrice,
  resolveSubscriptionEndDate,
  resolveTypePriceForBranch,
  roundMoney,
  scaleSessionMatrixForPackagePrice,
  primaryClubPaymentMethod,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';
import { isSubscriptionTypeAvailableAtBranch } from './subscription-type-branch-scope';
import {
  QuoteClubSubscriptionRenewalDto,
  RenewClubSubscriptionDto,
  RenewalStartMode,
} from './dto/club-subscription-payment.dto';

type RenewalClient = PrismaService | Prisma.TransactionClient;

type RenewalSource = {
  id: number;
  branch_id: number;
  member_id: number | null;
  subscription_type_id: number | null;
  special_class_type_id: number | null;
  private_package_id: number | null;
  private_trainer_id: number | null;
  private_discount_type?: string | null;
  subscription_type: string | null;
  subscription_start_date: string;
  subscription_end_date: string;
  sessions_count: number | null;
  sessions_used: number;
  is_linked_to_sessions: boolean;
  remaining_amount: unknown;
  status: string;
  freezes?: Array<{ id: number }>;
  customer_name?: string | null;
  gender?: 'male' | 'female' | null;
  employee_id?: number | null;
  sales_id?: number | null;
  payment_method?: ClubPaymentMethod | null;
  customer_source_id?: number | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  is_special?: boolean;
  allow_multiple_daily_entries?: boolean;
  is_time_based?: boolean;
  time_from?: string | null;
  time_to?: string | null;
  created_by?: number | null;
  member?: { member_code?: string | null } | null;
};

type ResolvedRenewalPackage = {
  subscriptionTypeId: number | null;
  specialClassTypeId: number | null;
  privatePackageId: number | null;
  privateTrainerId: number | null;
  name: string;
  grossValue: number;
  sessionsCount: number | null;
  isLinkedToSessions: boolean;
  endDate(startDate: string): string;
};

export type ClubSubscriptionRenewalQuote = {
  purchasedBenefits: Prisma.InputJsonObject;
  promotionTypeId: number | null;
  sourceSubscriptionId: number;
  tailSubscriptionId: number;
  subscriptionTypeId: number | null;
  specialClassTypeId: number | null;
  privatePackageId: number | null;
  privateTrainerId: number | null;
  subscriptionType: string;
  sessionsCount: number | null;
  startDate: string;
  endDate: string;
  /** `from_today` = started today by closing the still-running current period early. */
  scheduleMode: 'immediate' | 'after_current' | 'after_queue' | 'from_today';
  startMode: RenewalStartMode;
  /** True when the operator may choose between «مد الاشتراك» and «تجديد من اليوم». */
  canStartToday: boolean;
  /** Current subscription that will be closed yesterday when renewing from today. */
  closesSubscriptionId: number | null;
  /** Unused days/sessions of the current period given up by renewing from today. */
  forfeitedDays: number | null;
  forfeitedSessions: number | null;
  grossValue: number;
  discountEnabled: boolean;
  discountCodeId: number | null;
  discountPercentage: number | null;
  discountValue: number;
  netValue: number;
  paidAmount: number;
  remainingAmount: number;
  currentOutstandingAmount: number;
  quoteVersion: string;
};

@Injectable()
export class ClubSubscriptionRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ClubSubscriptionLifecycleService,
    private readonly branchScope: BranchScopeService,
    private readonly discountCodes: ClubDiscountCodesService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
  ) {}

  async quote(
    sourceId: number,
    dto: QuoteClubSubscriptionRenewalDto,
    user: JwtUser,
    client: RenewalClient = this.prisma,
  ): Promise<ClubSubscriptionRenewalQuote> {
    const source = await this.loadSource(sourceId, client);
    if (!this.branchScope.isBranchAllowed(user, source.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    this.assertRenewable(source);

    const tail = await this.lifecycle.findTail(sourceId, client);
    if (dto.privateTrainerId != null && !source.private_package_id) throw new BadRequestException('اختيار الكابتن متاح لتجديد البرايفت فقط');
    const renewalPackage = await this.resolveCurrentPackage(dto.privateTrainerId == null ? source : { ...source, private_trainer_id: dto.privateTrainerId }, client, dto.promotionTypeId);
    const start = this.resolveStart(sourceId, tail, dto.startMode ?? 'extend');
    const { startDate, scheduleMode } = start;
    const endDate = renewalPackage.endDate(startDate);
    // A promotion can change the package, but must not overlap an independent period
    // of that package already owned by this member. The transaction rechecks this.
    if (dto.promotionTypeId && dto.promotionTypeId !== source.subscription_type_id && source.member_id) {
      const overlapping = await client.club_subscriptions.findFirst({
        where: {
          id: { not: source.id },
          member_id: source.member_id,
          subscription_type_id: dto.promotionTypeId,
          status: { in: ['active', 'upcoming', 'frozen'] },
          subscription_start_date: { lte: endDate },
          subscription_end_date: { gte: startDate },
        },
        select: { id: true },
      });
      if (overlapping) throw new BadRequestException('يوجد اشتراك آخر في باقة العرض يتداخل مع فترة التجديد');
    }
    const discount = await this.discountCodes.resolveDiscount(
      {
        subscriptionValue: renewalPackage.grossValue,
        discountCodeId: dto.discountCodeId,
        discountEnabled: dto.discountEnabled,
        discountValue: dto.discountValue,
      },
      client,
    );
    const netValue = roundMoney(renewalPackage.grossValue - discount.discountValue);
    const paidAmount = roundMoney(Number(dto.paidAmount ?? 0));
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new BadRequestException('المبلغ المدفوع غير صالح');
    }
    if (paidAmount > netValue) {
      throw new BadRequestException('المبلغ المدفوع لا يمكن أن يتجاوز الصافي بعد الخصم');
    }
    resolveClubPayments(paidAmount, dto.paymentMethod ?? 'cash', dto.payments);
    const remaining = roundMoney(netValue - paidAmount);
    const quoteCore = {
      purchasedBenefits: await captureBenefits(client, renewalPackage.subscriptionTypeId),
      promotionTypeId: dto.promotionTypeId ?? null,
      sourceSubscriptionId: source.id,
      tailSubscriptionId: tail.id,
      subscriptionTypeId: renewalPackage.subscriptionTypeId,
      specialClassTypeId: renewalPackage.specialClassTypeId,
      privatePackageId: renewalPackage.privatePackageId,
      privateTrainerId: renewalPackage.privateTrainerId,
      subscriptionType: renewalPackage.name,
      sessionsCount: renewalPackage.sessionsCount,
      startDate,
      endDate,
      scheduleMode,
      startMode: start.startMode,
      canStartToday: start.canStartToday,
      closesSubscriptionId: start.closesSubscriptionId,
      forfeitedDays: start.forfeitedDays,
      forfeitedSessions: start.forfeitedSessions,
      grossValue: renewalPackage.grossValue,
      discountEnabled: discount.discountEnabled,
      discountCodeId: discount.discountCodeId,
      discountPercentage: discount.discountPercentage,
      discountValue: discount.discountValue,
      netValue,
      paidAmount,
      remainingAmount: remaining,
      currentOutstandingAmount: roundMoney(toNum(source.remaining_amount)),
    };

    return {
      ...quoteCore,
      quoteVersion: createHash('sha256').update(JSON.stringify(quoteCore)).digest('hex'),
    };
  }

  async renew(sourceId: number, dto: RenewClubSubscriptionDto, user: JwtUser) {
    const initialSource = await this.loadSource(sourceId, this.prisma);
    if (!this.branchScope.isBranchAllowed(user, initialSource.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    this.assertRenewable(initialSource);
    const memberId = initialSource.member_id!;
    const committed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
        const quote = await this.quote(sourceId, dto, user, tx);
        if (dto.quoteVersion && dto.quoteVersion !== quote.quoteVersion) {
          throw new ConflictException({
            statusCode: 409,
            code: 'SUBSCRIPTION_RENEWAL_QUOTE_CHANGED',
            message: 'السعر أو موعد التجديد اتغيّر — راجع البيانات وحاول مرة أخرى',
            quote,
          });
        }
        const source = await this.loadSource(sourceId, tx);
        if (quote.closesSubscriptionId != null) {
          // «تجديد من اليوم»: the running period ends yesterday so only the new one is active.
          await tx.club_subscriptions.update({
            where: { id: quote.closesSubscriptionId },
            data: {
              subscription_end_date: addDays(quote.startDate, -1),
              status: 'expired',
            },
          });
        }
        const subNumber = await this.generateSubscriptionNumber(tx, source.member_id);
        const paymentMethod = dto.paymentMethod ?? source.payment_method ?? 'cash';
        const payments = resolveClubPayments(quote.paidAmount, paymentMethod, dto.payments);
        const created = await tx.club_subscriptions.create({
          data: {
            subscription_number: subNumber,
            registration_date: localDateString(),
            branch_id: source.branch_id,
            member_id: source.member_id,
            customer_name: source.customer_name,
            subscription_type_id: quote.subscriptionTypeId,
            purchased_benefits: quote.purchasedBenefits,
            special_class_type_id: quote.specialClassTypeId,
            private_package_id: quote.privatePackageId,
            private_trainer_id: quote.privateTrainerId,
            private_discount_type: source.private_discount_type,
            subscription_type: quote.subscriptionType,
            subscription_start_date: quote.startDate,
            subscription_end_date: quote.endDate,
            subscription_value: quote.grossValue,
            discount_enabled: quote.discountEnabled,
            discount_code_id: quote.discountCodeId,
            discount_percentage: quote.discountPercentage,
            discount_value: quote.discountValue,
            paid_amount: quote.paidAmount,
            waived_amount: 0,
            transferred_credit_amount: 0,
            transferred_out_amount: 0,
            remaining_amount: quote.remainingAmount,
            gender: source.gender,
            employee_id: source.employee_id,
            sales_id: source.sales_id,
            payment_method:
              primaryClubPaymentMethod(payments) ??
              toClubPaymentMethod(paymentMethod) ??
              source.payment_method,
            customer_source_id: source.customer_source_id,
            guardian_name: source.guardian_name,
            guardian_phone: source.guardian_phone,
            status: quote.startDate <= localDateString() ? 'active' : 'upcoming',
            is_special: source.is_special ?? false,
            is_linked_to_sessions: quote.sessionsCount != null,
            sessions_count: quote.sessionsCount,
            sessions_used: 0,
            inbody_used: 0,
            spa_used: 0,
            allow_multiple_daily_entries: source.allow_multiple_daily_entries ?? false,
            is_time_based: source.is_time_based ?? false,
            time_from: source.time_from,
            time_to: source.time_to,
            renewed_from_subscription_id: quote.tailSubscriptionId,
            created_by: user.sub,
          },
        });

        let receiptNumber: string | undefined;
        if (quote.paidAmount > 0) {
          const receipt = await this.receipts.createForSubscription(
            created.id,
            quote.paidAmount,
            {
              memberName: source.customer_name ?? '',
              memberId: source.member_id ?? undefined,
              type: quote.subscriptionType,
              description: `تجديد اشتراك - ${quote.subscriptionType}`,
              paymentMethod,
              payments,
              createdBy: user.sub,
            },
            tx,
          );
          receiptNumber = receipt?.receipt_number;
          await this.accounting.postJournal(
            {
              subscriptionNumber: subNumber,
              sourceDocId: receiptNumber,
              paidAmount: quote.paidAmount,
              subscriptionValue: quote.grossValue,
              discountValue: quote.discountValue,
              discountEnabled: quote.discountEnabled,
              paymentMethod,
              payments,
              branchId: source.branch_id,
              createdBy: user.sub,
              registrationDate: localDateString(),
              kind: 'renewal',
            },
            tx,
          );
        }

        const row = await tx.club_subscriptions.findUnique({ where: { id: created.id } });
        if (!row) throw new NotFoundException('تعذر تحميل فترة التجديد بعد إنشائها');
        return { row, quote, subNumber, source };
    }, { maxWait: 10000, timeout: 20000 });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: committed.row.id,
      action: 'renew',
      actorUserId: user.sub,
      branchId: committed.source.branch_id,
      before: {
        sourceSubscriptionId: sourceId,
        currentOutstandingAmount: committed.quote.currentOutstandingAmount,
        ...(committed.quote.closesSubscriptionId != null
          ? {
              closedSubscriptionId: committed.quote.closesSubscriptionId,
              closedSubscriptionOriginalEndDate: committed.source.subscription_end_date,
              forfeitedDays: committed.quote.forfeitedDays,
              forfeitedSessions: committed.quote.forfeitedSessions,
            }
          : {}),
      },
      after: {
        renewedSubscriptionId: committed.row.id,
        renewedFromSubscriptionId: committed.quote.tailSubscriptionId,
        subscriptionNumber: committed.subNumber,
        startDate: committed.quote.startDate,
        endDate: committed.quote.endDate,
        startMode: committed.quote.startMode,
        grossValue: committed.quote.grossValue,
        paidAmount: committed.quote.paidAmount,
      },
    });

    if (committed.source.member_id) {
      void this.automation.emit('subscription_renewed', {
        memberId: committed.source.member_id,
        subscriptionId: committed.row.id,
        branchId: committed.source.branch_id,
        memberName: committed.source.customer_name ?? '—',
        subscriptionNumber: committed.subNumber,
      });
      if (committed.quote.scheduleMode === 'immediate' || committed.quote.scheduleMode === 'from_today') {
        await this.prisma.club_members.update({
          where: { id: committed.source.member_id },
          data: {
            start_date: committed.quote.startDate,
            end_date: committed.quote.endDate,
            is_active: true,
          },
        });
      }
    }

    return {
      subscription: this.mapSubscription(
        committed.row as unknown as Record<string, unknown>,
        committed.source.member?.member_code ?? null,
      ),
      quote: committed.quote,
    };
  }

  private async generateSubscriptionNumber(
    tx: Prisma.TransactionClient,
    memberId: number | null,
  ): Promise<string> {
      const member = memberId
        ? await tx.club_members.findUnique({
            where: { id: memberId },
            select: { member_code: true },
          })
        : null;
      const code = member?.member_code?.trim() || 'SUB';
      const taken = await tx.club_subscriptions.findMany({
        where: code === 'SUB'
          ? { subscription_number: { startsWith: 'SUB' } }
          : {
              OR: [
                { subscription_number: code },
                { subscription_number: { startsWith: `${code}-` } },
              ],
            },
        select: { subscription_number: true },
      });
      const used = new Set(taken.map((row) => row.subscription_number));
      if (code !== 'SUB' && !used.has(code)) return code;
      if (code === 'SUB') {
        let n = 1;
        while (used.has(`SUB${String(n).padStart(6, '0')}`)) n += 1;
        return `SUB${String(n).padStart(6, '0')}`;
      }
      let suffix = 2;
      while (used.has(`${code}-${suffix}`)) suffix += 1;
      return `${code}-${suffix}`;
  }

  private mapSubscription(row: Record<string, unknown>, memberCode: string | null) {
    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      branchId: row.branch_id,
      memberId: row.member_id,
      memberCode,
      customerName: row.customer_name,
      subscriptionTypeId: row.subscription_type_id,
      specialClassTypeId: row.special_class_type_id,
      privatePackageId: row.private_package_id,
      privateTrainerId: row.private_trainer_id,
      subscriptionType: row.subscription_type,
      subscriptionStartDate: row.subscription_start_date,
      subscriptionEndDate: row.subscription_end_date,
      subscriptionValue: toNum(row.subscription_value),
      discountEnabled: row.discount_enabled,
      discountCodeId: row.discount_code_id ?? null,
      discountPercentage: row.discount_percentage != null ? toNum(row.discount_percentage) : null,
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      remainingAmount: toNum(row.remaining_amount),
      status: row.status,
      isLinkedToSessions: row.is_linked_to_sessions,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      renewedFromSubscriptionId: row.renewed_from_subscription_id ?? null,
      receiptNumber: row.receipt_number ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async loadSource(sourceId: number, client: RenewalClient): Promise<RenewalSource> {
    const row = await client.club_subscriptions.findUnique({
      where: { id: sourceId },
      include: {
        freezes: { where: { is_active: true }, select: { id: true }, take: 1 },
        member: { select: { member_code: true } },
      },
    });
    if (!row) throw new NotFoundException('الاشتراك غير موجود');
    return row as unknown as RenewalSource;
  }

  private assertRenewable(source: RenewalSource) {
    if (source.status === 'frozen' || source.freezes?.length) {
      throw new BadRequestException('لا يمكن تجديد اشتراك مجمّد — ألغِ التجميد أولاً');
    }
    if (!source.member_id) {
      throw new BadRequestException('التجديد المجدول متاح لاشتراكات الأعضاء المسجلين فقط');
    }
  }

  private resolveStart(
    sourceId: number,
    tail: RenewalChainNode,
    requestedMode: RenewalStartMode,
  ): {
    startDate: string;
    scheduleMode: ClubSubscriptionRenewalQuote['scheduleMode'];
    startMode: RenewalStartMode;
    canStartToday: boolean;
    closesSubscriptionId: number | null;
    forfeitedDays: number | null;
    forfeitedSessions: number | null;
  } {
    const today = localDateString();
    const exhausted =
      tail.isLinkedToSessions &&
      tail.sessionsCount != null &&
      tail.sessionsUsed >= tail.sessionsCount;
    const none = { closesSubscriptionId: null, forfeitedDays: null, forfeitedSessions: null };
    if (tail.endDate < today || exhausted) {
      // Nothing left to keep: both choices mean "from today".
      return { startDate: today, scheduleMode: 'immediate', startMode: 'today', canStartToday: false, ...none };
    }
    // Renewing from today closes the running period yesterday, so it must have started before
    // today and must not already have a queued renewal after it.
    const canStartToday = tail.id === sourceId && tail.startDate < today;
    if (requestedMode === 'today') {
      if (tail.id !== sourceId) {
        throw new BadRequestException('يوجد تجديد مجدول بعد هذا الاشتراك — لا يمكن التجديد من اليوم، استخدم مد الاشتراك');
      }
      if (!canStartToday) {
        throw new BadRequestException('الاشتراك الحالي بدأ اليوم أو لم يبدأ بعد — استخدم مد الاشتراك');
      }
      return {
        startDate: today,
        scheduleMode: 'from_today',
        startMode: 'today',
        canStartToday,
        closesSubscriptionId: tail.id,
        forfeitedDays: daysBetween(today, tail.endDate) + 1,
        forfeitedSessions: tail.isLinkedToSessions && tail.sessionsCount != null
          ? Math.max(0, tail.sessionsCount - tail.sessionsUsed)
          : null,
      };
    }
    return {
      startDate: addDays(tail.endDate, 1),
      scheduleMode: tail.id === sourceId ? 'after_current' : 'after_queue',
      startMode: 'extend',
      canStartToday,
      ...none,
    };
  }

  private async resolveCurrentPackage(
    source: RenewalSource,
    client: RenewalClient,
    promotionTypeId?: number,
  ): Promise<ResolvedRenewalPackage> {
    if (promotionTypeId != null) {
      if (!Number.isInteger(promotionTypeId) || promotionTypeId < 1) {
        throw new BadRequestException('اختر عرضًا ترويجيًا صحيحًا');
      }
      if (!source.subscription_type_id || source.private_package_id || source.special_class_type_id) {
        throw new BadRequestException('العروض الترويجية متاحة لتجديد باقات الاشتراك فقط');
      }
      return this.resolveSubscriptionType({ ...source, subscription_type_id: promotionTypeId }, client, true);
    }
    if (source.private_package_id) return this.resolvePrivatePackage(source, client);
    if (source.special_class_type_id) return this.resolveSpecialClass(source, client);
    if (source.subscription_type_id) return this.resolveSubscriptionType(source, client);
    throw new BadRequestException('الاشتراك القديم غير مرتبط بباقة حالية قابلة للتجديد');
  }

  private async resolveSubscriptionType(
    source: RenewalSource,
    client: RenewalClient,
    usePromotion = false,
  ): Promise<ResolvedRenewalPackage> {
    const type = await client.club_subscription_types.findUnique({
      where: { id: source.subscription_type_id! },
      include: {
        branches: { select: { branch_id: true } },
        session_prices: {
          select: { sessions_count: true, price: true },
          orderBy: { sessions_count: 'asc' },
        },
      },
    });
    if (!type || !type.is_active) {
      throw new BadRequestException('الباقة الحالية غير موجودة أو غير نشطة');
    }
    if (!isSubscriptionTypeAvailableAtBranch(type, source.branch_id)) {
      throw new ForbiddenException('الباقة الحالية غير متاحة في فرع الاشتراك');
    }
    if (usePromotion) {
      if (!type.promo_enabled || !Number.isFinite(toNum(type.promo_price)) || toNum(type.promo_price) <= 0
        || (type.promo_ends_at != null && !(type.promo_ends_at.getTime() > Date.now()))) {
        throw new BadRequestException('العرض الترويجي انتهى أو لم يعد متاحًا — اختر عرضًا ساريًا');
      }
      if (type.is_linked_to_sessions !== source.is_linked_to_sessions) {
        throw new BadRequestException('اختر عرضًا من نفس نوع الاشتراك الحالي: مدة أو حصص');
      }
    }
    const defaultPrice = toNum(type.price);
    const packagePrice = resolveTypePriceForBranch(
      defaultPrice,
      source.branch_id,
      await loadBranchPricesForType(client as PrismaService, type.id),
    );
    let sessionsCount: number | null = null;
    let grossValue = packagePrice;
    if (type.is_linked_to_sessions) {
      const maxSessions = Number(type.sessions_count);
      sessionsCount = usePromotion ? maxSessions : source.sessions_count ?? maxSessions;
      if (
        !Number.isInteger(maxSessions) ||
        maxSessions < 1 ||
        !Number.isInteger(sessionsCount) ||
        sessionsCount < 1 ||
        sessionsCount > maxSessions
      ) {
        throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${maxSessions}`);
      }
      grossValue = resolveSessionMatrixPrice({
        packagePrice,
        maxSessions,
        selectedSessions: sessionsCount,
        matrix: scaleSessionMatrixForPackagePrice(
          type.session_prices.map((row) => ({
            sessionsCount: row.sessions_count,
            price: toNum(row.price),
          })),
          defaultPrice,
          packagePrice,
        ),
      });
    }
    return {
      subscriptionTypeId: type.id,
      specialClassTypeId: null,
      privatePackageId: null,
      privateTrainerId: null,
      name: type.name,
      grossValue: roundMoney(usePromotion ? toNum(type.promo_price) : grossValue),
      sessionsCount,
      isLinkedToSessions: type.is_linked_to_sessions,
      endDate: (startDate) =>
        resolveSubscriptionEndDate(startDate, type.days, type.is_linked_to_sessions, type.sessions_count),
    };
  }

  private async resolveSpecialClass(
    source: RenewalSource,
    client: RenewalClient,
  ): Promise<ResolvedRenewalPackage> {
    const classType = await client.club_class_types.findUnique({
      where: { id: source.special_class_type_id! },
    });
    if (!classType || !classType.is_active || classType.is_deleted) {
      throw new BadRequestException('نوع الحصة الحالي غير موجود أو غير نشط');
    }
    const maxSessions = classType.subscription_sessions_count;
    const sessionsCount = source.sessions_count ?? maxSessions;
    if (!Number.isInteger(sessionsCount) || sessionsCount < 1 || sessionsCount > maxSessions) {
      throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${maxSessions}`);
    }
    return {
      subscriptionTypeId: null,
      specialClassTypeId: classType.id,
      privatePackageId: null,
      privateTrainerId: null,
      name: classType.name,
      grossValue: roundMoney(toNum(classType.single_session_price) * sessionsCount),
      sessionsCount,
      isLinkedToSessions: true,
      endDate: (startDate) => addDays(startDate, Math.max(1, classType.subscription_validity_days) - 1),
    };
  }

  private async resolvePrivatePackage(
    source: RenewalSource,
    client: RenewalClient,
  ): Promise<ResolvedRenewalPackage> {
    const privatePackage = await client.club_private_packages.findUnique({
      where: { id: source.private_package_id! },
      include: { branches: { select: { branch_id: true } }, session_prices: true },
    });
    if (!privatePackage || !privatePackage.is_active) {
      throw new BadRequestException('الباقة الخاصة الحالية غير موجودة أو غير نشطة');
    }
    if (
      privatePackage.branches.length > 0 &&
      !privatePackage.branches.some((row) => row.branch_id === source.branch_id)
    ) {
      throw new ForbiddenException('الباقة الخاصة الحالية غير متاحة في فرع الاشتراك');
    }
    const trainer = source.private_trainer_id == null ? null : await client.club_trainers.findFirst({
      where: { id: source.private_trainer_id, is_active: true, is_deleted: false },
    });
    if (!trainer) throw new BadRequestException('كابتن البرايفت غير متاح. حدّث الكابتن قبل التجديد.');
    const sessionsCount = privatePackage.sessions_count == null ? null : source.sessions_count ?? privatePackage.sessions_count;
    if (sessionsCount != null && (sessionsCount < 1 || sessionsCount > privatePackage.sessions_count!)) {
      throw new BadRequestException('عدد الحصص السابق لم يعد متاحًا في الباقة. اختر باقة بديلة.');
    }
    const grossValue = sessionsCount == null ? toNum(privatePackage.price) : resolveSessionMatrixPrice({
      packagePrice: toNum(privatePackage.price), maxSessions: privatePackage.sessions_count!, selectedSessions: sessionsCount,
      matrix: (privatePackage.session_prices ?? []).map(row => ({ sessionsCount: row.sessions_count, price: toNum(row.price) })),
    });
    return {
      subscriptionTypeId: null,
      specialClassTypeId: null,
      privatePackageId: privatePackage.id,
      privateTrainerId: source.private_trainer_id,
      name: privatePackage.name,
      grossValue: roundMoney(grossValue),
      sessionsCount,
      isLinkedToSessions: privatePackage.sessions_count != null,
      endDate: (startDate) => addDays(startDate, Math.max(1, privatePackage.duration_days) - 1),
    };
  }
}
