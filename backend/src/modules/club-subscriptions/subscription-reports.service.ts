import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { localDateString } from '../club-members/club-member.utils';
import { expandClubReportBranchIds } from '../club-members/club-branch-groups';
import { toNum } from './club-subscription.utils';
import { receiptBusinessBranchWhere, receiptMemberAudienceWhere } from './receipt-business-scope';

export interface SubscriptionReportQuery {
  startDate?: string;
  endDate?: string;
  branch?: string;
  subscriptionTypeId?: string;
  gender?: string;
  status?: string;
  paymentState?: string;
  paymentMethod?: string;
  salesId?: string;
  userId?: string;
  customerSourceId?: string;
  hasDiscount?: string;
  kind?: string;
  source?: string;
}

export interface DailyCloseQuery {
  date?: string;
  branch?: string;
  gender?: string;
}

export interface DailyCloseInput {
  declaredAmount?: number;
  reason?: string;
}

type DailyCloseAction = 'review' | 'close' | 'reopen';
type DailyCloseState = 'open' | 'reviewed' | 'closed';

type DetailDimension = 'payment' | 'sales' | 'user' | 'status' | 'source' | 'subscriptionType';

type ServiceInvoiceReportRow = {
  invoice_date: string;
  total_amount: Prisma.Decimal;
  payment_method: string | null;
};

function missingOptionalTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';
}

/** Club payment methods that SPA/InBody (SalesPaymentMethod) cannot store as-is. */
function toSalesPaymentMethod(
  method: string,
): 'cash' | 'card' | 'wallet' | 'transfer' | 'mixed' | null {
  switch (method) {
    case 'cash':
      return 'cash';
    case 'card':
    case 'visa':
    case 'online':
      return 'card';
    case 'wallet':
    case 'instapay':
      return 'wallet';
    case 'transfer':
    case 'bank':
      return 'transfer';
    case 'mixed':
      return 'mixed';
    default:
      return null;
  }
}

function isPrismaEnumError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientValidationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2007')
  );
}

@Injectable()
export class SubscriptionReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private period(q: SubscriptionReportQuery) {
    const today = localDateString();
    const startDate = q.startDate || `${today.slice(0, 8)}01`;
    const endDate = q.endDate || today;
    assertDateOrder(startDate, endDate);
    return { startDate, endDate };
  }

  private branchIds(q: SubscriptionReportQuery, user?: JwtUser) {
    const branchIds = this.branchScope.resolveListFilter(user, q.branch ?? null);
    // Preserve the legacy Tanta report group: main (2), Up (5), Down (6).
    // A direct Up/Down selection remains isolated to that section.
    return expandClubReportBranchIds(branchIds);
  }

  private reportAudience(q: SubscriptionReportQuery, user?: JwtUser): 'male' | 'female' | null {
    return this.branchScope.memberGenderFilter(user) ??
      (q.gender === 'male' || q.gender === 'female' ? q.gender : null);
  }

  private async audienceMemberIds(
    q: SubscriptionReportQuery,
    user: JwtUser | undefined,
    branchIds: number[] | null,
  ): Promise<number[] | null> {
    const audience = this.reportAudience(q, user);
    if (!audience) return null;
    const rows = await this.prisma.club_members.findMany({
      where: {
        is_deleted: false,
        gender: audience,
        ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private subscriptionWhere(
    q: SubscriptionReportQuery,
    user?: JwtUser,
    statusOverride?: string,
  ): Prisma.club_subscriptionsWhereInput {
    const { startDate, endDate } = this.period(q);
    const branchIds = this.branchIds(q, user);
    const and: Prisma.club_subscriptionsWhereInput[] = [
      { registration_date: { gte: startDate, lte: endDate } },
      { OR: [{ member_id: null }, { member: { is_deleted: false } }] },
    ];
    if (branchIds !== null) and.push({ branch_id: { in: branchIds } });
    if (q.subscriptionTypeId && q.subscriptionTypeId !== 'all') {
      and.push({ subscription_type_id: Number(q.subscriptionTypeId) });
    }
    // A member audience is security scope. A URL filter may narrow an unrestricted
    // report, but must never broaden a men's/women's scoped token.
    const audience = this.reportAudience(q, user);
    if (audience) {
      and.push({ member: { is: { is_deleted: false, gender: audience } } });
    }
    if (q.salesId && q.salesId !== 'all') and.push({ member: { sales_id: Number(q.salesId) } });
    if (q.userId && q.userId !== 'all') and.push({ created_by: Number(q.userId) });
    if (q.customerSourceId && q.customerSourceId !== 'all') {
      and.push({ customer_source_id: Number(q.customerSourceId) });
    }
    if (q.hasDiscount === 'true') and.push({ discount_enabled: true });
    if (q.hasDiscount === 'false') and.push({ discount_enabled: false });
    if (q.kind === 'special') and.push({ OR: [{ is_special: true }, { special_class_type_id: { not: null } }] });
    if (q.kind === 'sessions') and.push({ is_linked_to_sessions: true, is_special: false });
    if (q.kind === 'package') and.push({ is_linked_to_sessions: false, is_special: false });
    if (q.paymentState === 'paid') and.push({ remaining_amount: { lte: 0 } });
    if (q.paymentState === 'partial') and.push({ paid_amount: { gt: 0 }, remaining_amount: { gt: 0 } });
    if (q.paymentState === 'unpaid') and.push({ paid_amount: { lte: 0 }, remaining_amount: { gt: 0 } });

    const status = statusOverride ?? q.status;
    if (status && status !== 'all') {
      const today = localDateString();
      if (status === 'frozen') and.push({ status: 'frozen' });
      if (status === 'upcoming') and.push({ subscription_start_date: { gt: today }, status: { not: 'frozen' } });
      if (status === 'expired') and.push({ subscription_end_date: { lt: today }, status: { not: 'frozen' } });
      if (status === 'active') {
        and.push({
          subscription_start_date: { lte: today },
          subscription_end_date: { gte: today },
          status: { not: 'frozen' },
        });
      }
      if (status === 'expiring') {
        const target = new Date();
        target.setDate(target.getDate() + 7);
        and.push({
          subscription_end_date: { gte: today, lte: target.toISOString().slice(0, 10) },
          status: { not: 'frozen' },
        });
      }
    }
    return { AND: and };
  }

  private receiptWhere(q: SubscriptionReportQuery, user?: JwtUser): Prisma.club_receiptsWhereInput {
    const { startDate, endDate } = this.period(q);
    const branchIds = this.branchIds(q, user);
    const and: Prisma.club_receiptsWhereInput[] = [];
    if (branchIds !== null) {
      and.push(receiptBusinessBranchWhere(branchIds));
    }
    const audience = this.reportAudience(q, user);
    if (audience) {
      and.push(receiptMemberAudienceWhere(audience));
    }
    return {
      receipt_date: { gte: startDate, lte: endDate },
      status: { in: ['مدفوعة', 'paid'] },
      ...(q.userId && q.userId !== 'all' ? { created_by: Number(q.userId) } : {}),
      ...(and.length ? { AND: and } : {}),
    };
  }

  async summary(q: SubscriptionReportQuery, user?: JwtUser) {
    const { startDate, endDate } = this.period(q);
    const branchIds = this.branchIds(q, user);
    const clubPaymentMethod =
      q.paymentMethod && q.paymentMethod !== 'all' ? q.paymentMethod : null;
    const salesPaymentMethod = clubPaymentMethod
      ? toSalesPaymentMethod(clubPaymentMethod)
      : null;
    const where = this.subscriptionWhere(q, user);
    const today = localDateString();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekDate = nextWeek.toISOString().slice(0, 10);

    const audience = this.reportAudience(q, user);
    const scopedMemberIds = await this.audienceMemberIds(q, user, branchIds);
    const [
      subscriptions,
      newMembersBySales,
      receiptUserGroups,
      paymentLines,
      legacyPayments,
      spaInvoices,
      inbodyInvoices,
      lockerSubscriptions,
      refunds,
      waivers,
      sourceRows,
    ] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        select: {
          id: true,
          member_id: true,
          subscription_type_id: true,
          subscription_type: true,
          registration_date: true,
          subscription_start_date: true,
          subscription_end_date: true,
          subscription_value: true,
          discount_value: true,
          discount_enabled: true,
          paid_amount: true,
          remaining_amount: true,
          waived_amount: true,
          status: true,
          created_by: true,
          customer_source_id: true,
          member: { select: { sales_id: true } },
        },
      }),
      this.prisma.club_members.groupBy({
        by: ['sales_id'],
        where: {
          is_deleted: false,
          sales_id: { not: null },
          created_at: {
            gte: new Date(`${startDate}T00:00:00`),
            lte: new Date(`${endDate}T23:59:59.999`),
          },
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
          ...(q.salesId && q.salesId !== 'all' ? { sales_id: Number(q.salesId) } : {}),
          ...(audience ? { gender: audience } : q.gender === 'male' || q.gender === 'female' ? { gender: q.gender } : {}),
        },
        _count: { _all: true },
      }),
      this.prisma.club_receipts.groupBy({
        by: ['created_by'],
        where: this.receiptWhere(q, user),
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.club_receipt_payments.groupBy({
          by: ['method'],
          where: {
            receipt: { is: this.receiptWhere(q, user) },
            ...(q.paymentMethod && q.paymentMethod !== 'all' ? { method: q.paymentMethod as never } : {}),
          },
          _count: { _all: true },
          _sum: { amount: true },
        })
        .catch((error) => {
          if (missingOptionalTable(error)) {
            return [] as Array<{
              method: string;
              _count: { _all: number };
              _sum: { amount: Prisma.Decimal | null };
            }>;
          }
          throw error;
        }),
      this.prisma.club_receipts
        .findMany({
          where: {
            ...this.receiptWhere(q, user),
            payments: { none: {} },
            ...(q.paymentMethod && q.paymentMethod !== 'all'
              ? { payment_method: q.paymentMethod as never }
              : {}),
          },
          select: { payment_method: true, amount: true },
        })
        .catch((error) => {
          if (!missingOptionalTable(error)) throw error;
          return this.prisma.club_receipts.findMany({
            where: {
              ...this.receiptWhere(q, user),
              ...(q.paymentMethod && q.paymentMethod !== 'all'
                ? { payment_method: q.paymentMethod as never }
                : {}),
            },
            select: { payment_method: true, amount: true },
          });
      }),
      clubPaymentMethod != null && salesPaymentMethod == null
        ? Promise.resolve<ServiceInvoiceReportRow[]>([])
        : this.prisma.club_spa_invoices
            .findMany({
              where: {
                is_active: true,
                status: 'paid',
                invoice_date: { gte: startDate, lte: endDate },
                ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
                ...(scopedMemberIds !== null ? { member_id: { in: scopedMemberIds } } : {}),
                ...(salesPaymentMethod != null ? { payment_method: salesPaymentMethod } : {}),
              },
              select: { invoice_date: true, total_amount: true, payment_method: true },
            })
            .catch((error) => {
              if (missingOptionalTable(error) || isPrismaEnumError(error)) {
                return [] as ServiceInvoiceReportRow[];
              }
              throw error;
            }),
      clubPaymentMethod != null && salesPaymentMethod == null
        ? Promise.resolve<ServiceInvoiceReportRow[]>([])
        : this.prisma.club_inbody_invoices
            .findMany({
              where: {
                is_active: true,
                status: 'paid',
                invoice_date: { gte: startDate, lte: endDate },
                ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
                ...(scopedMemberIds !== null ? { member_id: { in: scopedMemberIds } } : {}),
                ...(salesPaymentMethod != null ? { payment_method: salesPaymentMethod } : {}),
              },
              select: { invoice_date: true, total_amount: true, payment_method: true },
            })
            .catch((error) => {
              if (missingOptionalTable(error) || isPrismaEnumError(error)) {
                return [] as ServiceInvoiceReportRow[];
              }
              throw error;
            }),
      this.prisma.club_locker_subscriptions.findMany({
        where: {
          subscription_start_date: { gte: startDate, lte: endDate },
          ...(branchIds !== null ? { main_branch_id: { in: branchIds } } : {}),
          ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}),
          ...(q.paymentMethod && q.paymentMethod !== 'all'
            ? { payment_method: q.paymentMethod as never }
            : {}),
        },
        select: { subscription_start_date: true, paid_amount: true, payment_method: true },
      }),
      this.prisma.club_subscription_refunds.aggregate({
        where: {
          status: 'completed',
          refund_date: { gte: startDate, lte: endDate },
          subscription: {
            ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            ...(audience
              ? { member: { is: { is_deleted: false, gender: audience } } }
              : {}),
          },
        },
        _sum: { refund_amount: true },
        _count: true,
      }),
      this.prisma.club_subscription_waivers.aggregate({
        where: {
          waiver_date: { gte: startDate, lte: endDate },
          subscription: {
            ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            ...(audience
              ? { member: { is: { is_deleted: false, gender: audience } } }
              : {}),
          },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.club_customer_sources.findMany({ select: { id: true, name: true } }),
    ]);

    const employeeIds = [
      ...new Set([
        ...newMembersBySales.map((row) => row.sales_id).filter((id): id is number => id != null),
        ...subscriptions.map((row) => row.member?.sales_id).filter((id): id is number => id != null),
      ]),
    ];
    const userIds = [
      ...new Set([
        ...subscriptions.map((row) => row.created_by).filter((id): id is number => id != null),
        ...receiptUserGroups.map((row) => row.created_by).filter((id): id is number => id != null),
      ]),
    ];
    const [employees, users] = await Promise.all([
      employeeIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employee: true, emp_code: true },
          })
        : [],
      userIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, name: true, username: true },
          })
        : [],
    ]);
    const employeeNames = new Map<number, string>();
    for (const row of employees) {
      employeeNames.set(row.id, String(row.employee ?? row.emp_code ?? `#${row.id}`));
    }
    const userNames = new Map<number, string>();
    for (const row of users) {
      userNames.set(row.user_id, String(row.name || row.username || `#${row.user_id}`));
    }

    const contractValue = (row: (typeof subscriptions)[number]) =>
      Math.max(0, toNum(row.subscription_value) - (row.discount_enabled ? toNum(row.discount_value) : 0));
    const statusOf = (row: (typeof subscriptions)[number]) => {
      if (row.status === 'frozen') return 'frozen';
      if (row.subscription_start_date > today) return 'upcoming';
      if (row.subscription_end_date < today) return 'expired';
      return 'active';
    };

    const salesMap = new Map<number, {
      id: number;
      name: string;
      membersCount: number;
      contractsCount: number;
      contractsValue: number;
      collectedAmount: number;
      remainingAmount: number;
    }>();
    for (const row of newMembersBySales) {
      if (row.sales_id == null) continue;
      salesMap.set(row.sales_id, {
        id: row.sales_id,
        name: employeeNames.get(row.sales_id) ?? `#${row.sales_id}`,
        membersCount: row._count._all,
        contractsCount: 0,
        contractsValue: 0,
        collectedAmount: 0,
        remainingAmount: 0,
      });
    }
    for (const row of subscriptions) {
      const salesId = row.member?.sales_id;
      if (salesId == null) continue;
      const bucket = salesMap.get(salesId) ?? {
        id: salesId,
        name: employeeNames.get(salesId) ?? `#${salesId}`,
        membersCount: 0,
        contractsCount: 0,
        contractsValue: 0,
        collectedAmount: 0,
        remainingAmount: 0,
      };
      bucket.contractsCount += 1;
      bucket.contractsValue += contractValue(row);
      bucket.collectedAmount += toNum(row.paid_amount);
      bucket.remainingAmount += toNum(row.remaining_amount);
      salesMap.set(salesId, bucket);
    }

    const userMap = new Map<number, {
      id: number;
      name: string;
      subscriptionsCount: number;
      subscriptionsValue: number;
      receiptsCount: number;
      collectedAmount: number;
    }>();
    for (const row of subscriptions) {
      if (row.created_by == null) continue;
      const bucket = userMap.get(row.created_by) ?? {
        id: row.created_by,
        name: userNames.get(row.created_by) ?? `#${row.created_by}`,
        subscriptionsCount: 0,
        subscriptionsValue: 0,
        receiptsCount: 0,
        collectedAmount: 0,
      };
      bucket.subscriptionsCount += 1;
      bucket.subscriptionsValue += contractValue(row);
      userMap.set(row.created_by, bucket);
    }
    for (const row of receiptUserGroups) {
      if (row.created_by == null) continue;
      const bucket = userMap.get(row.created_by) ?? {
        id: row.created_by,
        name: userNames.get(row.created_by) ?? `#${row.created_by}`,
        subscriptionsCount: 0,
        subscriptionsValue: 0,
        receiptsCount: 0,
        collectedAmount: 0,
      };
      bucket.receiptsCount += row._count._all;
      bucket.collectedAmount += toNum(row._sum.amount);
      userMap.set(row.created_by, bucket);
    }

    const paymentMap = new Map<string, { key: string; count: number; amount: number }>();
    const sourceEnabled = (source: string) => !q.source || q.source === 'all' || q.source === source;
    const addPayment = (method: string | null, count: number, amount: unknown) => {
      const key = method ?? 'cash';
      const bucket = paymentMap.get(key) ?? { key, count: 0, amount: 0 };
      bucket.count += count;
      bucket.amount += toNum(amount);
      paymentMap.set(key, bucket);
    };
    let subscriptionReceiptCollected = 0;
    if (sourceEnabled('subscriptions')) {
      paymentLines.forEach((row) => {
        addPayment(row.method, row._count._all, row._sum.amount);
        subscriptionReceiptCollected += toNum(row._sum.amount);
      });
      legacyPayments.forEach((row) => {
        addPayment(row.payment_method, 1, row.amount);
        subscriptionReceiptCollected += toNum(row.amount);
      });
    }
    if (sourceEnabled('spa')) spaInvoices.forEach((row) => addPayment(row.payment_method, 1, row.total_amount));
    if (sourceEnabled('inbody')) inbodyInvoices.forEach((row) => addPayment(row.payment_method, 1, row.total_amount));
    if (sourceEnabled('locker')) lockerSubscriptions.forEach((row) => addPayment(row.payment_method, 1, row.paid_amount));

    const typeMap = new Map<string, { id: number | null; name: string; count: number; value: number; collected: number }>();
    const sourceNameById = new Map(sourceRows.map((row) => [row.id, row.name]));
    const sourceMap = new Map<number, { id: number; name: string; count: number; value: number }>();
    const trendMap = new Map<string, { date: string; subscriptions: number; services: number }>();
    const addTrend = (date: string, field: 'subscriptions' | 'services', amount: number) => {
      const bucket = trendMap.get(date) ?? { date, subscriptions: 0, services: 0 };
      bucket[field] += amount;
      trendMap.set(date, bucket);
    };
    for (const row of subscriptions) {
      const typeKey = String(row.subscription_type_id ?? row.subscription_type ?? 'unknown');
      const typeBucket = typeMap.get(typeKey) ?? {
        id: row.subscription_type_id,
        name: row.subscription_type ?? 'غير محدد',
        count: 0,
        value: 0,
        collected: 0,
      };
      typeBucket.count += 1;
      typeBucket.value += contractValue(row);
      typeBucket.collected += toNum(row.paid_amount);
      typeMap.set(typeKey, typeBucket);
      addTrend(row.registration_date, 'subscriptions', toNum(row.paid_amount));

      if (row.customer_source_id != null) {
        const sourceBucket = sourceMap.get(row.customer_source_id) ?? {
          id: row.customer_source_id,
          name: sourceNameById.get(row.customer_source_id) ?? `#${row.customer_source_id}`,
          count: 0,
          value: 0,
        };
        sourceBucket.count += 1;
        sourceBucket.value += contractValue(row);
        sourceMap.set(row.customer_source_id, sourceBucket);
      }
    }
    spaInvoices.forEach((row) => addTrend(row.invoice_date, 'services', toNum(row.total_amount)));
    inbodyInvoices.forEach((row) => addTrend(row.invoice_date, 'services', toNum(row.total_amount)));
    lockerSubscriptions.forEach((row) => addTrend(row.subscription_start_date, 'services', toNum(row.paid_amount)));

    const spaRevenue = spaInvoices.reduce((sum, row) => sum + toNum(row.total_amount), 0);
    const inbodyRevenue = inbodyInvoices.reduce((sum, row) => sum + toNum(row.total_amount), 0);
    const lockerRevenue = lockerSubscriptions.reduce((sum, row) => sum + toNum(row.paid_amount), 0);
    // Prefer cash collected in the period (receipts) over contract paid_amount so the pie matches
    // "وسائل الدفع" and installment collections on older subscriptions.
    const subscriptionCollected = sourceEnabled('subscriptions')
      ? subscriptionReceiptCollected > 0
        ? subscriptionReceiptCollected
        : subscriptions.reduce((sum, row) => sum + toNum(row.paid_amount), 0)
      : 0;
    const services = [
      { key: 'subscriptions', name: 'الاشتراكات', count: subscriptions.length, amount: subscriptionCollected },
      { key: 'spa', name: 'فواتير SPA', count: spaInvoices.length, amount: sourceEnabled('spa') ? spaRevenue : 0 },
      { key: 'inbody', name: 'فواتير InBody', count: inbodyInvoices.length, amount: sourceEnabled('inbody') ? inbodyRevenue : 0 },
      { key: 'locker', name: 'اشتراكات اللوكر', count: lockerSubscriptions.length, amount: sourceEnabled('locker') ? lockerRevenue : 0 },
    ].filter((row) => sourceEnabled(row.key));
    const totalCollectedAllSources = services.reduce((sum, row) => sum + row.amount, 0);

    return {
      period: { startDate, endDate },
      overview: {
        contractsCount: subscriptions.length,
        contractsValue: subscriptions.reduce((sum, row) => sum + contractValue(row), 0),
        subscriptionCollected,
        totalCollectedAllSources,
        remainingAmount: subscriptions.reduce((sum, row) => sum + toNum(row.remaining_amount), 0),
        refundsAmount: toNum(refunds._sum.refund_amount),
        refundsCount: refunds._count,
        waiversAmount: toNum(waivers._sum.amount),
        waiversCount: waivers._count,
        discountedCount: subscriptions.filter((row) => row.discount_enabled).length,
      },
      statuses: [
        { key: 'active', name: 'نشطة', count: subscriptions.filter((row) => statusOf(row) === 'active').length },
        { key: 'expiring', name: 'تنتهي خلال 7 أيام', count: subscriptions.filter((row) => statusOf(row) === 'active' && row.subscription_end_date <= nextWeekDate).length },
        { key: 'expired', name: 'منتهية', count: subscriptions.filter((row) => statusOf(row) === 'expired').length },
        { key: 'upcoming', name: 'قادمة', count: subscriptions.filter((row) => statusOf(row) === 'upcoming').length },
        { key: 'frozen', name: 'مجمّدة', count: subscriptions.filter((row) => statusOf(row) === 'frozen').length },
        { key: 'outstanding', name: 'عليها متبقي', count: subscriptions.filter((row) => toNum(row.remaining_amount) > 0).length },
      ],
      services,
      payments: [...paymentMap.values()].sort((a, b) => b.amount - a.amount),
      sales: [...salesMap.values()].sort((a, b) => b.collectedAmount - a.collectedAmount || b.membersCount - a.membersCount),
      users: [...userMap.values()].sort((a, b) => b.collectedAmount - a.collectedAmount || b.subscriptionsCount - a.subscriptionsCount),
      subscriptionTypes: [...typeMap.values()].sort((a, b) => b.value - a.value),
      customerSources: [...sourceMap.values()].sort((a, b) => b.count - a.count),
      trend: [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Legacy monthly revenue - expenses = net-profit analysis, with server-owned scope. */
  async monthlyAnalysis(q: SubscriptionReportQuery, user?: JwtUser) {
    const { startDate, endDate } = this.period(q);
    const branchIds = this.branchIds(q, user);
    const audience = this.reportAudience(q, user);
    const scopedMemberIds = await this.audienceMemberIds(q, user, branchIds);
    const createdAt = {
      gte: new Date(`${startDate}T00:00:00`),
      lte: new Date(`${endDate}T23:59:59.999`),
    };
    const [subscriptions, lockers, sales, refunds, purchases, expenseVouchers] = await Promise.all([
      this.prisma.club_subscriptions.aggregate({
        where: this.subscriptionWhere(q, user),
        _sum: { paid_amount: true },
      }),
      this.prisma.club_locker_subscriptions.aggregate({
        where: {
          subscription_start_date: { gte: startDate, lte: endDate },
          ...(branchIds !== null ? { main_branch_id: { in: branchIds } } : {}),
          ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}),
        },
        _sum: { paid_amount: true },
      }),
      this.prisma.sales_quick_sales.aggregate({
        where: {
          sale_date: { gte: startDate, lte: endDate },
          status: 'completed',
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
          // A scoped token must not receive anonymous or opposite-section sales.
          ...(scopedMemberIds !== null ? { customer_member_id: { in: scopedMemberIds } } : {}),
        },
        _sum: { collected_amount: true },
      }),
      this.prisma.club_subscription_refunds.aggregate({
        where: {
          status: 'completed',
          refund_date: { gte: startDate, lte: endDate },
          subscription: {
            ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
            ...(audience
              ? { member: { is: { is_deleted: false, gender: audience } } }
              : {}),
          },
        },
        _sum: { refund_amount: true },
      }),
      this.prisma.prc_purchase_orders.aggregate({
        where: {
          is_deleted: false,
          created_at: createdAt,
          status: { notIn: ['cancelled', 'ملغي'] },
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        },
        _sum: { total_amount: true },
      }),
      this.prisma.fin_expenses.aggregate({
        where: {
          is_deleted: false,
          expense_date: { gte: startDate, lte: endDate },
          ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        },
        _sum: { total_amount: true },
      }),
    ]);

    const subscriptionAmount = toNum(subscriptions._sum.paid_amount);
    const lockerAmount = toNum(lockers._sum.paid_amount);
    const salesAmount = toNum(sales._sum.collected_amount);
    const refundAmount = toNum(refunds._sum.refund_amount);
    const purchasesAmount = toNum(purchases._sum.total_amount);
    const expenseAmount = toNum(expenseVouchers._sum.total_amount);
    const totalRevenue = subscriptionAmount + lockerAmount + salesAmount;
    const totalExpenses = refundAmount + purchasesAmount + expenseAmount;

    return {
      period: { startDate, endDate },
      scope: {
        branchIds,
        audience,
        // Current expense and purchase ledgers are branch-owned, not member-gender-owned.
        sharedBranchExpenses: audience != null,
      },
      revenues: [
        { key: 'subscriptions', label: 'الاشتراكات', amount: subscriptionAmount },
        { key: 'lockers', label: 'اللوكر', amount: lockerAmount },
        { key: 'sales', label: 'المبيعات', amount: salesAmount },
        { key: 'total_revenue', label: 'اجمالى الايراد', amount: totalRevenue },
      ],
      expenses: [
        { key: 'subscription_refunds', label: 'مرتجع الاشتراكات', amount: refundAmount },
        { key: 'purchases', label: 'المشتريات', amount: purchasesAmount },
        { key: 'expense_vouchers', label: 'سندات الصرف', amount: expenseAmount },
        { key: 'total_expenses', label: 'اجمالى المصروفات', amount: totalExpenses },
      ],
      netProfit: { label: 'صافى الربح', amount: totalRevenue - totalExpenses },
    };
  }

  private dailyCloseContext(q: DailyCloseQuery, user: JwtUser) {
    const date = q.date || localDateString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('تاريخ الإقفال غير صالح');
    }
    const branchIds = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (!branchIds || branchIds.length !== 1) {
      throw new BadRequestException('اختر فرعًا واحدًا لإقفال اليوم');
    }
    const audience = this.reportAudience({ gender: q.gender }, user);
    const branchId = branchIds[0];
    return {
      date,
      branchId,
      audience,
      entityId: `${date}:${branchId}:${audience ?? 'all'}`,
    };
  }

  private dailyCloseState(action?: string | null): DailyCloseState {
    if (action === 'daily_close_review') return 'reviewed';
    if (action === 'daily_close_close') return 'closed';
    return 'open';
  }

  private async dailyCloseSnapshot(
    q: DailyCloseQuery,
    user: JwtUser,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const context = this.dailyCloseContext(q, user);
    const reportQuery: SubscriptionReportQuery = {
      startDate: context.date,
      endDate: context.date,
      branch: String(context.branchId),
      ...(context.audience ? { gender: context.audience } : {}),
    };
    const [subscriptions, receipts] = await Promise.all([
      client.club_subscriptions.aggregate({
        where: this.subscriptionWhere(reportQuery, user),
        _count: true,
        _sum: { subscription_value: true, paid_amount: true, remaining_amount: true },
      }),
      client.club_receipts.aggregate({
        where: this.receiptWhere(reportQuery, user),
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return {
      subscriptionsCount: subscriptions._count,
      contractsValue: toNum(subscriptions._sum.subscription_value),
      subscriptionPaid: toNum(subscriptions._sum.paid_amount),
      remainingAmount: toNum(subscriptions._sum.remaining_amount),
      receiptsCount: receipts._count,
      expectedAmount: toNum(receipts._sum.amount),
    };
  }

  async dailyClose(q: DailyCloseQuery, user: JwtUser) {
    const context = this.dailyCloseContext(q, user);
    const [latest, history, summary] = await Promise.all([
      this.prisma.business_audit_log.findFirst({
        where: { entity_type: 'club_subscription_daily_close', entity_id: context.entityId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.business_audit_log.findMany({
        where: { entity_type: 'club_subscription_daily_close', entity_id: context.entityId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.dailyCloseSnapshot(q, user),
    ]);
    return {
      ...context,
      state: this.dailyCloseState(latest?.action),
      summary,
      latest: latest ?? null,
      history,
    };
  }

  async transitionDailyClose(
    action: DailyCloseAction,
    q: DailyCloseQuery,
    input: DailyCloseInput,
    user: JwtUser,
  ) {
    assertSystemAdmin(user);
    const context = this.dailyCloseContext(q, user);
    const reason = input.reason?.trim() || null;
    if (action === 'reopen' && !reason) {
      throw new BadRequestException('سبب إعادة فتح اليوم مطلوب');
    }
    const declaredAmount = Number(input.declaredAmount);
    if (action !== 'reopen' && (!Number.isFinite(declaredAmount) || declaredAmount < 0)) {
      throw new BadRequestException('المبلغ الفعلي للخزينة غير صالح');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK(${`club_daily_close_${context.entityId}`}, 10)`;
      try {
        const latest = await tx.business_audit_log.findFirst({
          where: { entity_type: 'club_subscription_daily_close', entity_id: context.entityId },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        });
        const beforeState = this.dailyCloseState(latest?.action);
        if (action === 'review' && beforeState !== 'open') {
          throw new BadRequestException('لا يمكن مراجعة يوم سبق إقفاله أو مراجعته');
        }
        if (action === 'close' && beforeState !== 'reviewed') {
          throw new BadRequestException('يجب مراجعة اليوم قبل الإقفال');
        }
        if (action === 'reopen' && beforeState !== 'closed') {
          throw new BadRequestException('اليوم غير مقفل');
        }
        const state: DailyCloseState = action === 'review' ? 'reviewed' : action === 'close' ? 'closed' : 'open';
        const summary = await this.dailyCloseSnapshot(q, user, tx);
        const previous = (latest?.after_json ?? null) as Record<string, unknown> | null;
        const effectiveDeclared = action === 'reopen'
          ? Number(previous?.declaredAmount ?? summary.expectedAmount)
          : declaredAmount;
        const after = {
          state,
          date: context.date,
          branchId: context.branchId,
          audience: context.audience,
          expectedAmount: summary.expectedAmount,
          declaredAmount: effectiveDeclared,
          variance: effectiveDeclared - summary.expectedAmount,
          summary,
        };
        const event = await tx.business_audit_log.create({
          data: {
            entity_type: 'club_subscription_daily_close',
            entity_id: context.entityId,
            action: `daily_close_${action}`,
            actor_user_id: user.sub,
            actor_name: user.name ?? null,
            branch_id: context.branchId,
            before_json: previous as Prisma.InputJsonValue | undefined,
            after_json: after,
            changed_fields: ['state', 'declaredAmount', 'variance'],
            reason,
          },
        });
        return { ...context, state, summary, event, reconciliation: after };
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${`club_daily_close_${context.entityId}`})`;
      }
    });
  }

  async details(
    dimension: DetailDimension,
    key: string,
    q: SubscriptionReportQuery & { page?: string; pageSize?: string },
    user?: JwtUser,
  ) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 10));
    const skip = (page - 1) * pageSize;
    if (!['payment', 'sales', 'user', 'status', 'source', 'subscriptionType'].includes(dimension)) {
      throw new BadRequestException('نوع تفاصيل التقرير غير صالح');
    }

    if (dimension === 'payment') {
      return this.paymentDetails(key, q, user, page, pageSize);
    }

    if (dimension === 'sales') {
      const { startDate, endDate } = this.period(q);
      const branchIds = this.branchIds(q, user);
      const where: Prisma.club_membersWhereInput = {
        is_deleted: false,
        sales_id: Number(key),
        created_at: {
          gte: new Date(`${startDate}T00:00:00`),
          lte: new Date(`${endDate}T23:59:59.999`),
        },
        ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        ...(this.reportAudience(q, user) ? { gender: this.reportAudience(q, user)! } : {}),
      };
      const [rows, total] = await Promise.all([
        this.prisma.club_members.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            member_code: true,
            name: true,
            phone: true,
            created_at: true,
            branch_id: true,
            subscriptions: {
              orderBy: { registration_date: 'desc' },
              take: 1,
              select: {
                subscription_number: true,
                subscription_type: true,
                subscription_value: true,
                paid_amount: true,
                remaining_amount: true,
              },
            },
            attendances: {
              orderBy: { check_in_time: 'desc' },
              take: 1,
              select: { check_in_time: true },
            },
          },
        }),
        this.prisma.club_members.count({ where }),
      ]);
      return {
        data: rows.map((row) => {
          const subscription = row.subscriptions[0];
          return {
            id: `member:${row.id}`,
            activity: 'عضو جديد',
            memberName: row.name,
            memberCode: row.member_code,
            phone: row.phone,
            reference: subscription?.subscription_number ?? '—',
            category: subscription?.subscription_type ?? 'بدون اشتراك',
            date: row.created_at.toISOString(),
            amount: subscription ? toNum(subscription.subscription_value) : 0,
            collected: subscription ? toNum(subscription.paid_amount) : 0,
            remaining: subscription ? toNum(subscription.remaining_amount) : 0,
            branchId: row.branch_id,
            lastCheckIn: row.attendances[0]?.check_in_time?.toISOString() ?? null,
          };
        }),
        total,
        page,
        pageSize,
      };
    }

    if (dimension === 'user') {
      return this.userDetails(Number(key), q, user, page, pageSize);
    }

    const overrideQuery = { ...q };
    let statusOverride: string | undefined;
    if (dimension === 'status') {
      if (key === 'outstanding') overrideQuery.paymentState = 'partial';
      else statusOverride = key;
    }
    if (dimension === 'source') overrideQuery.customerSourceId = key;
    if (dimension === 'subscriptionType') overrideQuery.subscriptionTypeId = key;
    const where = this.subscriptionWhere(overrideQuery, user, statusOverride);
    const [rows, total] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          subscription_number: true,
          customer_name: true,
          subscription_type: true,
          registration_date: true,
          subscription_value: true,
          paid_amount: true,
          remaining_amount: true,
          branch_id: true,
          member: { select: { member_code: true, name: true } },
        },
      }),
      this.prisma.club_subscriptions.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: `subscription:${row.id}`,
        activity: 'اشتراك',
        memberName: row.member?.name ?? row.customer_name ?? '—',
        memberCode: row.member?.member_code ?? null,
        reference: row.subscription_number,
        category: row.subscription_type ?? '—',
        date: row.registration_date,
        amount: toNum(row.subscription_value),
        collected: toNum(row.paid_amount),
        remaining: toNum(row.remaining_amount),
        branchId: row.branch_id,
      })),
      total,
      page,
      pageSize,
    };
  }

  private async paymentDetails(
    method: string,
    q: SubscriptionReportQuery,
    user: JwtUser | undefined,
    page: number,
    pageSize: number,
  ) {
    const { startDate, endDate } = this.period(q);
    const branchIds = this.branchIds(q, user);
    const audience = this.reportAudience(q, user);
    const scopedMemberIds = await this.audienceMemberIds(q, user, branchIds);
    const take = page * pageSize;
    const receiptWhere = this.receiptWhere(q, user);
    const source = q.source && q.source !== 'all' ? q.source : null;
    const salesMethod = toSalesPaymentMethod(method);
    const [paymentRows, legacyRows, spaRows, inbodyRows, lockerRows] = await Promise.all([
      source && source !== 'subscriptions'
        ? []
        : this.prisma.club_receipt_payments
            .findMany({
              where: { method: method as never, receipt: { is: receiptWhere } },
              orderBy: { created_at: 'desc' },
              take,
              include: {
                receipt: {
                  select: {
                    id: true,
                    receipt_number: true,
                    member_name: true,
                    amount: true,
                    receipt_date: true,
                    created_at: true,
                    created_by: true,
                    branch_id: true,
                    subscription: { select: { subscription_type: true, branch_id: true } },
                  },
                },
              },
            })
            .catch((error) => {
              if (missingOptionalTable(error)) return [];
              throw error;
            }),
      source && source !== 'subscriptions'
        ? []
        : this.prisma.club_receipts
            .findMany({
              where: { ...receiptWhere, payments: { none: {} }, payment_method: method as never },
              orderBy: { created_at: 'desc' },
              take,
              select: {
                id: true,
                receipt_number: true,
                member_name: true,
                amount: true,
                receipt_date: true,
                created_at: true,
                created_by: true,
                branch_id: true,
                subscription: { select: { subscription_type: true, branch_id: true } },
              },
            })
            .catch((error) => {
              if (!missingOptionalTable(error)) throw error;
              return this.prisma.club_receipts.findMany({
                where: { ...receiptWhere, payment_method: method as never },
                orderBy: { created_at: 'desc' },
                take,
                select: {
                  id: true,
                  receipt_number: true,
                  member_name: true,
                  amount: true,
                  receipt_date: true,
                  created_at: true,
                  created_by: true,
                  branch_id: true,
                  subscription: { select: { subscription_type: true, branch_id: true } },
                },
              });
            }),
      source && source !== 'spa'
        ? []
        : salesMethod == null
          ? []
          : this.prisma.club_spa_invoices
              .findMany({
                where: {
                  is_active: true,
                  status: 'paid',
                  payment_method: salesMethod,
                  invoice_date: { gte: startDate, lte: endDate },
                  ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
                  ...(scopedMemberIds !== null ? { member_id: { in: scopedMemberIds } } : {}),
                },
                orderBy: { created_at: 'desc' },
                take,
                select: {
                  id: true,
                  invoice_number: true,
                  invoice_date: true,
                  total_amount: true,
                  member_id: true,
                  branch_id: true,
                  created_by: true,
                  created_at: true,
                  service: { select: { name: true } },
                },
              })
              .catch((error) => {
                if (missingOptionalTable(error) || isPrismaEnumError(error)) return [];
                throw error;
              }),
      source && source !== 'inbody'
        ? []
        : salesMethod == null
          ? []
          : this.prisma.club_inbody_invoices
              .findMany({
                where: {
                  is_active: true,
                  status: 'paid',
                  payment_method: salesMethod,
                  invoice_date: { gte: startDate, lte: endDate },
                  ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
                  ...(scopedMemberIds !== null ? { member_id: { in: scopedMemberIds } } : {}),
                },
                orderBy: { created_at: 'desc' },
                take,
                select: {
                  id: true,
                  invoice_number: true,
                  invoice_date: true,
                  total_amount: true,
                  customer_name: true,
                  member_id: true,
                  branch_id: true,
                  created_by: true,
                  created_at: true,
                  service: { select: { name: true } },
                },
              })
              .catch((error) => {
                if (missingOptionalTable(error) || isPrismaEnumError(error)) return [];
                throw error;
              }),
      source && source !== 'locker'
        ? []
        : this.prisma.club_locker_subscriptions.findMany({
            where: {
              payment_method: method as never,
              subscription_start_date: { gte: startDate, lte: endDate },
              ...(branchIds !== null ? { main_branch_id: { in: branchIds } } : {}),
              ...(audience
                ? { member: { is: { is_deleted: false, gender: audience } } }
                : {}),
            },
            orderBy: { created_at: 'desc' },
            take,
            select: {
              id: true,
              subscription_number: true,
              customer_name: true,
              subscription_start_date: true,
              paid_amount: true,
              main_branch_id: true,
              created_by: true,
              created_at: true,
            },
          }),
    ]);

    const memberIds = [
      ...spaRows.map((row) => row.member_id),
      ...inbodyRows.map((row) => row.member_id).filter((id): id is number => id != null),
    ];
    const creatorIds = [
      ...paymentRows.map((row) => row.receipt.created_by),
      ...legacyRows.map((row) => row.created_by),
      ...spaRows.map((row) => row.created_by),
      ...inbodyRows.map((row) => row.created_by),
      ...lockerRows.map((row) => row.created_by),
    ].filter((id): id is number => id != null);
    const [members, creators] = await Promise.all([
      memberIds.length
        ? this.prisma.club_members.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, member_code: true },
          })
        : [],
      creatorIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: creatorIds } },
            select: { user_id: true, name: true, username: true },
          })
        : [],
    ]);
    const memberById = new Map<number, { id: number; name: string; member_code: string }>();
    for (const row of members) memberById.set(row.id, row);
    const creatorById = new Map<number, string>();
    for (const row of creators) {
      creatorById.set(row.user_id, String(row.name || row.username || `#${row.user_id}`));
    }
    const data = [
      ...paymentRows.map((row) => ({
        id: `receipt-payment:${row.id}`,
        activity: 'دفعة اشتراك',
        memberName: row.receipt.member_name,
        memberCode: null,
        reference: row.receipt.receipt_number,
        category: row.receipt.subscription?.subscription_type ?? 'اشتراك',
        date: row.receipt.created_at.toISOString(),
        amount: toNum(row.amount),
        collected: toNum(row.amount),
        remaining: null,
        branchId: row.receipt.subscription?.branch_id ?? row.receipt.branch_id ?? null,
        userName: row.receipt.created_by ? creatorById.get(row.receipt.created_by) ?? null : null,
      })),
      ...legacyRows.map((row) => ({
        id: `receipt:${row.id}`,
        activity: 'دفعة اشتراك',
        memberName: row.member_name,
        memberCode: null,
        reference: row.receipt_number,
        category: row.subscription?.subscription_type ?? 'اشتراك',
        date: row.created_at.toISOString(),
        amount: toNum(row.amount),
        collected: toNum(row.amount),
        remaining: null,
        branchId: row.subscription?.branch_id ?? row.branch_id ?? null,
        userName: row.created_by ? creatorById.get(row.created_by) ?? null : null,
      })),
      ...spaRows.map((row) => ({
        id: `spa:${row.id}`,
        activity: 'فاتورة SPA',
        memberName: memberById.get(row.member_id)?.name ?? '—',
        memberCode: memberById.get(row.member_id)?.member_code ?? null,
        reference: row.invoice_number,
        category: row.service.name,
        date: row.created_at.toISOString(),
        amount: toNum(row.total_amount),
        collected: toNum(row.total_amount),
        remaining: 0,
        branchId: row.branch_id,
        userName: row.created_by ? creatorById.get(row.created_by) ?? null : null,
      })),
      ...inbodyRows.map((row) => ({
        id: `inbody:${row.id}`,
        activity: 'فاتورة InBody',
        memberName: (row.member_id ? memberById.get(row.member_id)?.name : null) ?? row.customer_name ?? '—',
        memberCode: row.member_id ? memberById.get(row.member_id)?.member_code ?? null : null,
        reference: row.invoice_number,
        category: row.service?.name ?? 'InBody',
        date: row.created_at.toISOString(),
        amount: toNum(row.total_amount),
        collected: toNum(row.total_amount),
        remaining: 0,
        branchId: row.branch_id,
        userName: row.created_by ? creatorById.get(row.created_by) ?? null : null,
      })),
      ...lockerRows.map((row) => ({
        id: `locker:${row.id}`,
        activity: 'اشتراك لوكر',
        memberName: row.customer_name,
        memberCode: null,
        reference: row.subscription_number,
        category: 'لوكر',
        date: row.created_at.toISOString(),
        amount: toNum(row.paid_amount),
        collected: toNum(row.paid_amount),
        remaining: null,
        branchId: row.main_branch_id,
        userName: row.created_by ? creatorById.get(row.created_by) ?? null : null,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const offset = (page - 1) * pageSize;
    return {
      data: data.slice(offset, offset + pageSize),
      total: data.length < take ? offset + data.length : offset + data.length + 1,
      page,
      pageSize,
    };
  }

  private async userDetails(
    userId: number,
    q: SubscriptionReportQuery,
    user: JwtUser | undefined,
    page: number,
    pageSize: number,
  ) {
    const take = page * pageSize;
    const subWhere = { ...this.subscriptionWhere({ ...q, userId: String(userId) }, user) };
    const receiptWhere = { ...this.receiptWhere({ ...q, userId: String(userId) }, user) };
    const [subscriptions, receipts] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: subWhere,
        orderBy: { created_at: 'desc' },
        take,
        select: {
          id: true,
          subscription_number: true,
          customer_name: true,
          subscription_type: true,
          subscription_value: true,
          paid_amount: true,
          remaining_amount: true,
          branch_id: true,
          created_at: true,
          member: { select: { member_code: true, name: true } },
        },
      }),
      this.prisma.club_receipts.findMany({
        where: receiptWhere,
        orderBy: { created_at: 'desc' },
        take,
        select: {
          id: true,
          receipt_number: true,
          member_name: true,
          amount: true,
          created_at: true,
          subscription: { select: { subscription_type: true, branch_id: true } },
          member: { select: { member_code: true, name: true } },
        },
      }),
    ]);
    const data = [
      ...subscriptions.map((row) => ({
        id: `subscription:${row.id}`,
        activity: 'اشتراك جديد',
        memberName: row.member?.name ?? row.customer_name ?? '—',
        memberCode: row.member?.member_code ?? null,
        reference: row.subscription_number,
        category: row.subscription_type ?? '—',
        date: row.created_at.toISOString(),
        amount: toNum(row.subscription_value),
        collected: 0,
        remaining: toNum(row.remaining_amount),
        branchId: row.branch_id,
      })),
      ...receipts.map((row) => ({
        id: `receipt:${row.id}`,
        activity: 'تحصيل دفعة',
        memberName: row.member?.name ?? row.member_name,
        memberCode: row.member?.member_code ?? null,
        reference: row.receipt_number,
        category: row.subscription?.subscription_type ?? '—',
        date: row.created_at.toISOString(),
        amount: toNum(row.amount),
        collected: toNum(row.amount),
        remaining: null,
        branchId: row.subscription?.branch_id ?? null,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const offset = (page - 1) * pageSize;
    return {
      data: data.slice(offset, offset + pageSize),
      total: data.length < take ? offset + data.length : offset + data.length + 1,
      page,
      pageSize,
    };
  }
}
