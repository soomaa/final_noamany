import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';
import { loadBranchPricesForType } from './club-subscription-branch-prices.loader';
import { addDays, deriveSessionAwareStatus, primaryClubPaymentMethod, resolveClubPayments, resolveSessionMatrixPrice, resolveSubscriptionEndDate, roundMoney, toClubPaymentMethod, toNum } from './club-subscription.utils';
import { isSubscriptionTypeAvailableAtBranch } from './subscription-type-branch-scope';
import { assertClubAccountingDayOpen } from './daily-close-lock.util';

type Db = PrismaService | Prisma.TransactionClient;
type Source = Record<string, any>;
export type RenewalQuote = {
  sourceSubscriptionId: number; tailSubscriptionId: number; subscriptionTypeId: number | null;
  subscriptionType: string; sessionsCount: number | null; startDate: string; endDate: string;
  scheduleMode: 'immediate' | 'after_current' | 'after_queue'; grossValue: number;
  discountEnabled: boolean; discountCodeId: number | null; discountPercentage: number | null;
  discountValue: number; netValue: number; paidAmount: number; remainingAmount: number;
  currentOutstandingAmount: number; quoteVersion: string;
};

/**
 * Renewal is intentionally a separate service: the historical sale is never updated. The quote
 * resolves package/duration/price at the server, then the action appends one linked successor.
 */
@Injectable()
export class ClubSubscriptionRenewalService {
  constructor(
    private readonly prisma: PrismaService, private readonly lifecycle: ClubSubscriptionLifecycleService,
    private readonly scope: BranchScopeService, private readonly discounts: ClubDiscountCodesService,
    private readonly receipts: ClubReceiptsService, private readonly accounting: ClubSubscriptionAccountingService,
    private readonly audit: BusinessAuditService, private readonly automation: AutomationEngineService,
  ) {}

  async quote(id: number, dto: any, user: JwtUser, db: Db = this.prisma): Promise<RenewalQuote> {
    const source = await this.source(id, db);
    if (!this.scope.isBranchAllowed(user, source.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    this.assertAudience(user, source);
    this.assertRenewable(source);
    const tail = await this.lifecycle.findTail(id, db as any);
    const current = await this.currentPackage(source, db);
    const today = this.today();
    const exhausted = tail.isLinkedToSessions && tail.sessionsCount != null && tail.sessionsUsed >= tail.sessionsCount;
    const immediate = tail.endDate < today || exhausted;
    const startDate = immediate ? today : addDays(tail.endDate, 1);
    const scheduleMode: RenewalQuote['scheduleMode'] = immediate ? 'immediate' : tail.id === id ? 'after_current' : 'after_queue';
    const endDate = resolveSubscriptionEndDate(startDate, current.days, current.linked);
    const discount = await this.discounts.resolveDiscount({ subscriptionValue: current.price, discountCodeId: dto?.discountCodeId, discountEnabled: dto?.discountEnabled, discountValue: dto?.discountValue }, db as any);
    const paidAmount = roundMoney(Number(dto?.paidAmount ?? 0));
    const netValue = roundMoney(current.price - discount.discountValue);
    if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > netValue) throw new BadRequestException('المبلغ المدفوع لا يمكن أن يتجاوز الصافي بعد الخصم');
    resolveClubPayments(paidAmount, dto?.paymentMethod ?? source.payment_method ?? 'cash', dto?.payments);
    const core = { sourceSubscriptionId: source.id, tailSubscriptionId: tail.id, subscriptionTypeId: source.subscription_type_id ?? null, subscriptionType: current.name, sessionsCount: current.sessionsCount, startDate, endDate, scheduleMode, grossValue: current.price, discountEnabled: discount.discountEnabled, discountCodeId: discount.discountCodeId, discountPercentage: discount.discountPercentage, discountValue: discount.discountValue, netValue, paidAmount, remainingAmount: roundMoney(netValue - paidAmount), currentOutstandingAmount: roundMoney(toNum(source.remaining_amount)) };
    return { ...core, quoteVersion: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
  }

  async renew(id: number, dto: any, user: JwtUser) {
    if (!dto?.quoteVersion || typeof dto.quoteVersion !== 'string') {
      throw new ConflictException('تأكيد عرض التجديد مطلوب — افتح التجديد وراجع السعر مرة أخرى');
    }
    const original = await this.source(id, this.prisma);
    if (!this.scope.isBranchAllowed(user, original.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    this.assertAudience(user, original);
    this.assertRenewable(original);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${original.member_id} FOR UPDATE`;
      const quote = await this.quote(id, dto, user, tx);
      if (dto?.quoteVersion && dto.quoteVersion !== quote.quoteVersion) throw new ConflictException({ code: 'SUBSCRIPTION_RENEWAL_QUOTE_CHANGED', message: 'السعر أو موعد التجديد اتغيّر — راجع البيانات وحاول مرة أخرى', quote });
      const lockedSource = await this.source(id, tx);
      this.assertAudience(user, lockedSource);
      const accountingGender = lockedSource.member?.gender ?? null;
      await assertClubAccountingDayOpen(tx, {
        date: this.today(),
        branchId: lockedSource.branch_id,
        gender: accountingGender,
      });
      const number = await this.nextNumber(tx, original.member_id);
      const paymentMethod = dto?.paymentMethod ?? original.payment_method ?? 'cash';
      const payments = resolveClubPayments(quote.paidAmount, paymentMethod, dto?.payments);
      const created = await tx.club_subscriptions.create({ data: {
        subscription_number: number, registration_date: this.today(), branch_id: original.branch_id, member_id: original.member_id, customer_name: original.customer_name,
        subscription_type_id: original.subscription_type_id, special_class_type_id: original.special_class_type_id, private_package_id: original.private_package_id, private_trainer_id: original.private_trainer_id,
        subscription_type: quote.subscriptionType, subscription_start_date: quote.startDate, subscription_end_date: quote.endDate, subscription_value: quote.grossValue,
        discount_enabled: quote.discountEnabled, discount_code_id: quote.discountCodeId, discount_percentage: quote.discountPercentage, discount_value: quote.discountValue,
        paid_amount: quote.paidAmount, waived_amount: 0, transferred_credit_amount: 0, transferred_out_amount: 0, remaining_amount: quote.remainingAmount,
        gender: accountingGender, employee_id: original.employee_id, sales_id: original.sales_id, payment_method: primaryClubPaymentMethod(payments) ?? toClubPaymentMethod(paymentMethod) ?? original.payment_method,
        customer_source_id: original.customer_source_id, guardian_name: original.guardian_name, guardian_phone: original.guardian_phone,
        status: deriveSessionAwareStatus({ startDate: quote.startDate, endDate: quote.endDate, isLinkedToSessions: quote.sessionsCount != null, sessionsCount: quote.sessionsCount, sessionsUsed: 0 }),
        is_special: original.is_special ?? false, is_linked_to_sessions: quote.sessionsCount != null, sessions_count: quote.sessionsCount, sessions_used: 0, inbody_used: 0, spa_used: 0,
        allow_multiple_daily_entries: original.allow_multiple_daily_entries ?? false, is_time_based: original.is_time_based ?? false, time_from: original.time_from, time_to: original.time_to,
        renewed_from_subscription_id: quote.tailSubscriptionId, created_by: user.sub,
      }});
      if (quote.paidAmount > 0) {
        const receipt = await this.receipts.createForSubscription(created.id, quote.paidAmount, { memberName: original.customer_name ?? '', memberId: original.member_id ?? undefined, type: quote.subscriptionType, description: `تجديد اشتراك - ${quote.subscriptionType}`, paymentMethod, payments, createdBy: user.sub }, tx);
        await this.accounting.postJournal({ subscriptionNumber: number, sourceDocId: receipt?.receipt_number, paidAmount: quote.paidAmount, subscriptionValue: quote.grossValue, discountValue: quote.discountValue, discountEnabled: quote.discountEnabled, paymentMethod, payments, branchId: original.branch_id, createdBy: user.sub, registrationDate: this.today(), kind: 'renewal' }, tx);
      }
      if (quote.scheduleMode === 'immediate') {
        await tx.club_members.update({
          where: { id: original.member_id! },
          data: { start_date: quote.startDate, end_date: quote.endDate, is_active: true },
        });
      }
      return { created, quote, number };
    }, { maxWait: 10000, timeout: 20000 });
    await this.audit.log({ entityType: 'club_subscription', entityId: result.created.id, action: 'renew', actorUserId: user.sub, branchId: original.branch_id, before: { sourceSubscriptionId: id, currentOutstandingAmount: toNum(original.remaining_amount) }, after: { renewedSubscriptionId: result.created.id, renewedFromSubscriptionId: result.quote.tailSubscriptionId, subscriptionNumber: result.number, grossValue: result.quote.grossValue, paidAmount: result.quote.paidAmount } });
    void this.automation.emit('subscription_renewed', { memberId: original.member_id!, subscriptionId: result.created.id, branchId: original.branch_id, memberName: original.customer_name ?? '—', subscriptionNumber: result.number });
    return { subscription: result.created, quote: result.quote };
  }

  private async source(id: number, db: Db): Promise<Source> {
    const row = await db.club_subscriptions.findUnique({
      where: { id },
      include: {
        freezes: { where: { is_active: true }, select: { id: true } },
        member: { select: { member_code: true, gender: true, is_deleted: true } },
      },
    });
    if (!row) throw new NotFoundException('الاشتراك غير موجود');
    return row as Source;
  }
  private assertAudience(user: JwtUser, source: Source) {
    const audience = this.scope.memberGenderFilter(user);
    if (audience && (!source.member || source.member.is_deleted || source.member.gender !== audience)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا القسم');
    }
  }
  private assertRenewable(source: Source) { if (!source.member_id) throw new BadRequestException('التجديد المجدول متاح لاشتراكات الأعضاء المسجلين فقط'); if (source.status === 'frozen' || source.freezes?.length) throw new BadRequestException('لا يمكن تجديد اشتراك مجمّد — ألغِ التجميد أولاً'); if (!source.subscription_type_id && !source.special_class_type_id && !source.private_package_id) throw new BadRequestException('الاشتراك القديم غير مرتبط بباقة قابلة للتجديد'); }
  private async currentPackage(source: Source, db: Db) {
    if (source.special_class_type_id) {
      const type = await db.club_class_types.findUnique({ where: { id: source.special_class_type_id } });
      if (!type?.is_active || type.is_deleted) throw new BadRequestException('نوع الحصة الحالي غير موجود أو غير نشط');
      const sessionsCount = source.sessions_count ?? type.subscription_sessions_count;
      if (!Number.isInteger(sessionsCount) || sessionsCount < 1 || sessionsCount > type.subscription_sessions_count) throw new BadRequestException('عدد الحصص في الباقة لم يعد صالحًا');
      return { name: type.name, price: roundMoney(toNum(type.single_session_price) * sessionsCount), days: type.subscription_validity_days, linked: true, sessionsCount };
    }
    if (source.private_package_id) {
      const type = await db.club_private_packages.findUnique({ where: { id: source.private_package_id }, include: { branches: { select: { branch_id: true } } } });
      if (!type?.is_active) throw new BadRequestException('الباقة الخاصة الحالية غير موجودة أو غير نشطة');
      if (type.branches.length && !type.branches.some((branch) => branch.branch_id === source.branch_id)) throw new ForbiddenException('الباقة الخاصة الحالية غير متاحة في فرع الاشتراك');
      return { name: type.name, price: roundMoney(toNum(type.price)), days: type.duration_days, linked: type.sessions_count != null, sessionsCount: type.sessions_count };
    }
    const type = await db.club_subscription_types.findUnique({ where: { id: source.subscription_type_id }, include: { branches: { select: { branch_id: true } }, session_prices: { select: { sessions_count: true, price: true }, orderBy: { sessions_count: 'asc' } } } });
    if (!type?.is_active) throw new BadRequestException('الباقة الحالية غير موجودة أو غير نشطة');
    if (!isSubscriptionTypeAvailableAtBranch(type as any, source.branch_id)) throw new ForbiddenException('الباقة الحالية غير متاحة في فرع الاشتراك');
    const basePrice = toNum(type.price);
    const prices = await loadBranchPricesForType(db as PrismaService, type.id); const branchPrice = prices.find((x) => x.branchId === source.branch_id)?.price ?? basePrice;
    const sessionsCount = type.is_linked_to_sessions ? (source.sessions_count ?? type.sessions_count) : null;
    if (type.is_linked_to_sessions && (!Number.isInteger(sessionsCount) || !sessionsCount || sessionsCount > (type.sessions_count ?? 0))) throw new BadRequestException('عدد الحصص في الباقة لم يعد صالحًا');
    const scaledMatrix = (type.session_prices ?? []).map((row) => ({
      sessionsCount: row.sessions_count,
      price: basePrice > 0 ? roundMoney(toNum(row.price) * (branchPrice / basePrice)) : toNum(row.price),
    }));
    const price = type.is_linked_to_sessions && sessionsCount != null
      ? resolveSessionMatrixPrice({ packagePrice: branchPrice, maxSessions: type.sessions_count!, selectedSessions: sessionsCount, matrix: scaledMatrix })
      : branchPrice;
    return { name: type.name, price: roundMoney(price), days: type.days, linked: type.is_linked_to_sessions, sessionsCount };
  }
  private async nextNumber(tx: Prisma.TransactionClient, memberId: number) { const member = await tx.club_members.findUnique({ where: { id: memberId }, select: { member_code: true } }); const base = member?.member_code || 'SUB'; const rows = await tx.club_subscriptions.findMany({ where: { subscription_number: { startsWith: base } }, select: { subscription_number: true } }); let n = 1; const used = new Set(rows.map((r) => r.subscription_number)); while (used.has(`${base}-${n}`)) n += 1; return used.has(base) ? `${base}-${n}` : base; }
  private today() { return localDateString(); }
}
