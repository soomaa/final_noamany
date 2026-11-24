import { BadRequestException, Injectable } from '@nestjs/common';
import { ClubGender, Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { localDateString } from '../club-members/club-member.utils';
import { expandClubReportBranchIds } from '../club-members/club-branch-groups';
import { receiptGenderWhere, roundMoney as round2, subscriptionGenderWhere, toNum } from './club-subscription.utils';
import { mapPaymentMethodToArabic } from '../finance/finance.utils';

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

type DetailDimension = 'payment' | 'sales' | 'user' | 'status' | 'source' | 'subscriptionType';

type ServiceInvoiceReportRow = {
  invoice_date: string;
  total_amount: Prisma.Decimal;
  payment_method: string | null;
};

function missingOptionalTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    return true;
  }
  // Split receipt payments are an optional enhancement for existing installations.
  // If an older generated client lacks either relation, fall back to the receipt
  // header's payment method instead of failing the whole subscriptions report.
  return error instanceof Prisma.PrismaClientValidationError &&
    /Unknown (?:argument|field) `(?:receipt|payments)`/.test(error.message);
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

/**
 * Noamany sells SPA as subscription packages («سيشن سبا فقط», «اشتراك سبا فقط 10 حصص»), not as
 * SPA invoices, so the report counts those packages under SPA. Packages that combine the gym and
 * SPA («شهري سبا») stay under الاشتراكات: their price has no SPA share to split out.
 */
const SPA_ONLY_TYPE_PATTERNS = ['سبا فقط', 'سيشن سبا'];

export function isSpaOnlySubscriptionType(name: string | null | undefined): boolean {
  const text = (name ?? '').replace(/\s+/g, ' ');
  return SPA_ONLY_TYPE_PATTERNS.some((pattern) => text.includes(pattern));
}

const SPA_ONLY_SUBSCRIPTION: Prisma.club_subscriptionsWhereInput = {
  OR: SPA_ONLY_TYPE_PATTERNS.map((pattern) => ({ subscription_type: { contains: pattern } })),
};

/** Receipts of SPA-only packages (`spa`) or of every other subscription and receipt (`subscriptions`). */
function receiptSourceWhere(source: 'spa' | 'subscriptions'): Prisma.club_receiptsWhereInput {
  const spa: Prisma.club_receiptsWhereInput = { subscription: { is: SPA_ONLY_SUBSCRIPTION } };
  return source === 'spa' ? spa : { NOT: [spa] };
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

  private categoryFilter(gender: ClubGender): Prisma.club_subscriptionsWhereInput {
    return subscriptionGenderWhere(gender);
  }

  /** رجالي/حريمي/الكل: one-section staff are locked to their section (403 for the other one). */
  private memberGender(q: SubscriptionReportQuery, user?: JwtUser): ClubGender | null {
    return this.branchScope.resolveMemberGenderRequest(user, q.gender);
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
    const audienceGender = this.memberGender(q, user);
    if (audienceGender) and.push(this.categoryFilter(audienceGender));
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
    const gender = this.memberGender(q, user);
    return {
      receipt_date: { gte: startDate, lte: endDate },
      status: { in: ['مدفوعة', 'paid'] },
      ...(gender ? { AND: [receiptGenderWhere(gender)] } : {}),
      ...(q.userId && q.userId !== 'all' ? { created_by: Number(q.userId) } : {}),
      ...(branchIds !== null
        ? {
            OR: [
              { branch_id: { in: branchIds } },
              { subscription: { branch_id: { in: branchIds } } },
              { member: { branch_id: { in: branchIds } } },
            ],
          }
        : {}),
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
    const memberGender = this.memberGender(q, user);
    const today = localDateString();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekDate = nextWeek.toISOString().slice(0, 10);

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
      spaPaymentLines,
      spaLegacyPayments,
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
          ...(memberGender ? { gender: memberGender } : {}),
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
          ...(memberGender
            ? { OR: [{ gender: memberGender }, { gender: null, member: { is: { gender: memberGender } } }] }
            : {}),
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
          ...(branchIds !== null ? { subscription: { branch_id: { in: branchIds } } } : {}),
          ...(memberGender ? { AND: [{ subscription: { is: subscriptionGenderWhere(memberGender) } }] } : {}),
        },
        _sum: { refund_amount: true },
        _count: true,
      }),
      this.prisma.club_subscription_waivers.aggregate({
        where: {
          waiver_date: { gte: startDate, lte: endDate },
          ...(branchIds !== null ? { subscription: { branch_id: { in: branchIds } } } : {}),
          ...(memberGender ? { AND: [{ subscription: { is: subscriptionGenderWhere(memberGender) } }] } : {}),
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.club_customer_sources.findMany({ select: { id: true, name: true } }),
      this.prisma.club_receipt_payments
        .groupBy({
          by: ['method'],
          where: {
            receipt: { is: { AND: [this.receiptWhere(q, user), receiptSourceWhere('spa')] } },
            ...(q.paymentMethod && q.paymentMethod !== 'all' ? { method: q.paymentMethod as never } : {}),
          },
          _count: { _all: true },
          _sum: { amount: true },
        })
        .catch((error) => {
          if (missingOptionalTable(error)) {
            return [] as Array<{ method: string; _count: { _all: number }; _sum: { amount: Prisma.Decimal | null } }>;
          }
          throw error;
        }),
      this.prisma.club_receipts
        .findMany({
          where: {
            AND: [this.receiptWhere(q, user), receiptSourceWhere('spa')],
            payments: { none: {} },
            ...(q.paymentMethod && q.paymentMethod !== 'all' ? { payment_method: q.paymentMethod as never } : {}),
          },
          select: { payment_method: true, amount: true },
        })
        .catch((error) => {
          if (missingOptionalTable(error)) return [] as Array<{ payment_method: string | null; amount: Prisma.Decimal }>;
          throw error;
        }),
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
    // Receipts split into SPA-only packages and everything else; together they are all receipts.
    const spaByMethod = new Map<string, { count: number; amount: number }>();
    const addSpaLine = (method: string | null, count: number, amount: unknown) => {
      const key = method ?? 'cash';
      const bucket = spaByMethod.get(key) ?? { count: 0, amount: 0 };
      bucket.count += count;
      bucket.amount += toNum(amount);
      spaByMethod.set(key, bucket);
    };
    spaPaymentLines.forEach((row) => addSpaLine(row.method, row._count._all, row._sum.amount));
    spaLegacyPayments.forEach((row) => addSpaLine(row.payment_method, 1, row.amount));
    const allByMethod = new Map<string, { count: number; amount: number }>();
    const addAllLine = (method: string | null, count: number, amount: unknown) => {
      const key = method ?? 'cash';
      const bucket = allByMethod.get(key) ?? { count: 0, amount: 0 };
      bucket.count += count;
      bucket.amount += toNum(amount);
      allByMethod.set(key, bucket);
    };
    paymentLines.forEach((row) => addAllLine(row.method, row._count._all, row._sum.amount));
    legacyPayments.forEach((row) => addAllLine(row.payment_method, 1, row.amount));

    let subscriptionReceiptCollected = 0;
    let spaReceiptCollected = 0;
    for (const [method, all] of allByMethod) {
      const spa = spaByMethod.get(method) ?? { count: 0, amount: 0 };
      subscriptionReceiptCollected += all.amount - spa.amount;
      spaReceiptCollected += spa.amount;
      if (sourceEnabled('subscriptions')) addPayment(method, all.count - spa.count, all.amount - spa.amount);
      if (sourceEnabled('spa') && spa.count) addPayment(method, spa.count, spa.amount);
    }
    for (const bucket of paymentMap.values()) bucket.amount = round2(bucket.amount);
    for (const key of [...paymentMap.keys()]) {
      const bucket = paymentMap.get(key);
      if (bucket && bucket.count <= 0 && Math.abs(bucket.amount) < 0.005) paymentMap.delete(key);
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
      addTrend(row.registration_date, isSpaOnlySubscriptionType(row.subscription_type) ? 'services' : 'subscriptions', toNum(row.paid_amount));

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

    const spaSubscriptions = subscriptions.filter((row) => isSpaOnlySubscriptionType(row.subscription_type));
    const usesReceipts = subscriptionReceiptCollected + spaReceiptCollected > 0;
    const spaPackagesCollected = usesReceipts
      ? spaReceiptCollected
      : spaSubscriptions.reduce((sum, row) => sum + toNum(row.paid_amount), 0);
    const spaRevenue = spaInvoices.reduce((sum, row) => sum + toNum(row.total_amount), 0) + spaPackagesCollected;
    const inbodyRevenue = inbodyInvoices.reduce((sum, row) => sum + toNum(row.total_amount), 0);
    const lockerRevenue = lockerSubscriptions.reduce((sum, row) => sum + toNum(row.paid_amount), 0);
    // Prefer cash collected in the period (receipts) over contract paid_amount so the pie matches
    // "وسائل الدفع" and installment collections on older subscriptions.
    const subscriptionCollected = sourceEnabled('subscriptions')
      ? round2(usesReceipts
        ? subscriptionReceiptCollected
        : subscriptions.reduce((sum, row) => sum + (isSpaOnlySubscriptionType(row.subscription_type) ? 0 : toNum(row.paid_amount)), 0))
      : 0;
    const services = [
      { key: 'subscriptions', name: 'الاشتراكات', count: subscriptions.length - spaSubscriptions.length, amount: subscriptionCollected },
      { key: 'spa', name: 'SPA', count: spaInvoices.length + spaSubscriptions.length, amount: sourceEnabled('spa') ? round2(spaRevenue) : 0 },
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

  /**
   * «نظرة عامة» → «تصدير Excel للفترة»: every subscription registered in the period with the money
   * collected on it split by payment method, plus «إيرادات أخرى» (other paid receipts of the same
   * period and branch), so the grand total equals the period's takings.
   */
  async periodExport(q: SubscriptionReportQuery, user?: JwtUser) {
    const { startDate, endDate } = this.period(q);
    const where = this.subscriptionWhere(q, user);
    const total = await this.prisma.club_subscriptions.count({ where });
    if (total > 50_000) throw new BadRequestException('الفترة كبيرة جدًا للتصدير، اختر فترة أقصر');
    const subs = await this.prisma.club_subscriptions.findMany({
      where,
      orderBy: [{ registration_date: 'asc' }, { id: 'asc' }],
      select: {
        id: true, subscription_number: true, subscription_type: true, registration_date: true, created_at: true,
        subscription_value: true, discount_enabled: true, discount_value: true, paid_amount: true, customer_name: true,
        member: { select: { member_code: true, name: true, phone: true } },
      },
    });

    // A subscription's columns hold all its paid receipts, so they add up to «المدفوع»;
    // «إيرادات أخرى» is every other paid receipt dated in the period.
    const ids = new Set(subs.map((row) => row.id));
    const paidStatus = { in: ['مدفوعة', 'paid'] };
    const receiptSelect = (receiptWhere: Prisma.club_receiptsWhereInput) => this.prisma.club_receipts.findMany({
      where: receiptWhere,
      orderBy: [{ receipt_date: 'asc' }, { id: 'asc' }],
      select: {
        id: true, receipt_number: true, receipt_date: true, created_at: true, subscription_id: true, amount: true,
        payment_method: true, description: true, member_name: true,
        member: { select: { member_code: true, name: true, phone: true } },
        subscription: { select: { subscription_number: true, subscription_type: true, customer_name: true } },
        payments: { select: { method: true, amount: true } },
      },
    });
    const [ownReceipts, otherReceipts] = await Promise.all([
      ids.size ? receiptSelect({ subscription_id: { in: [...ids] }, status: paidStatus }) : Promise.resolve([]),
      receiptSelect({
        AND: [
          this.receiptWhere(q, user),
          ...(ids.size ? [{ OR: [{ subscription_id: null }, { subscription_id: { notIn: [...ids] } }] }] : []),
        ],
      }),
    ]);

    // One column per payment method, in the gym's usual order; only methods used in the period.
    const order = ['cash', 'card', 'visa', 'instapay', 'wallet', 'transfer', 'bank', 'online'];
    const used = new Set<string>();
    const split = (receipt: (typeof ownReceipts)[number]) => {
      const lines = receipt.payments.length
        ? receipt.payments
        : [{ method: receipt.payment_method ?? 'cash', amount: receipt.amount }];
      const out: Record<string, number> = {};
      for (const line of lines) {
        const amount = toNum(line.amount);
        if (!amount) continue;
        const name = mapPaymentMethodToArabic(line.method ?? 'cash');
        used.add(line.method ?? 'cash');
        out[name] = round2((out[name] ?? 0) + amount);
      }
      return out;
    };

    const paidBySub = new Map<number, Record<string, number>>();
    const other: Array<Record<string, unknown>> = [];
    for (const receipt of [...ownReceipts, ...otherReceipts]) {
      const byMethod = split(receipt);
      if (receipt.subscription_id != null && ids.has(receipt.subscription_id)) {
        const current = paidBySub.get(receipt.subscription_id) ?? {};
        for (const [name, amount] of Object.entries(byMethod)) current[name] = round2((current[name] ?? 0) + amount);
        paidBySub.set(receipt.subscription_id, current);
        continue;
      }
      const amount = round2(Object.values(byMethod).reduce((sum, value) => sum + value, 0));
      if (!amount) continue;
      other.push({
        receiptNumber: receipt.receipt_number,
        date: receipt.receipt_date,
        createdAt: receipt.created_at.toISOString(),
        memberCode: receipt.member?.member_code ?? null,
        memberName: receipt.member?.name ?? receipt.member_name ?? receipt.subscription?.customer_name ?? null,
        phone: receipt.member?.phone ?? null,
        description: receipt.subscription
          ? `${receipt.subscription.subscription_type ?? 'اشتراك'} · ${receipt.subscription.subscription_number}`
          : receipt.description?.trim() || null,
        amount,
        byMethod,
      });
    }
    const methods = [...used]
      .sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
      .map((method) => mapPaymentMethodToArabic(method))
      .filter((name, index, all) => all.indexOf(name) === index);

    return {
      startDate,
      endDate,
      methods,
      rows: subs.map((row) => ({
        memberCode: row.member?.member_code ?? null,
        memberName: row.member?.name ?? row.customer_name ?? null,
        phone: row.member?.phone ?? null,
        subscriptionType: row.subscription_type ?? null,
        subscriptionNumber: row.subscription_number,
        registrationDate: row.registration_date,
        createdAt: row.created_at.toISOString(),
        value: toNum(row.subscription_value),
        discount: row.discount_enabled ? toNum(row.discount_value) : 0,
        paid: toNum(row.paid_amount),
        byMethod: paidBySub.get(row.id) ?? {},
      })),
      other,
    };
  }

  /** «الأداء حسب نوع الاشتراك» → «تصدير Excel»: the period's subscriptions grouped by package. */
  async subscriptionTypesExport(q: SubscriptionReportQuery, user?: JwtUser) {
    const { startDate, endDate } = this.period(q);
    const where = this.subscriptionWhere(q, user);
    const total = await this.prisma.club_subscriptions.count({ where });
    if (total > 50_000) throw new BadRequestException('الفترة كبيرة جدًا للتصدير، اختر فترة أقصر');
    const rows = await this.prisma.club_subscriptions.findMany({
      where,
      orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
      select: {
        id: true, subscription_number: true, subscription_type_id: true, subscription_type: true,
        registration_date: true, subscription_start_date: true, subscription_end_date: true,
        subscription_value: true, discount_enabled: true, discount_value: true, paid_amount: true, remaining_amount: true,
        payment_method: true, status: true, branch_id: true, created_by: true, created_at: true, customer_name: true,
        member: { select: { member_code: true, name: true, phone: true, sales_id: true } },
      },
    });
    const salesIds = [...new Set(rows.map((r) => r.member?.sales_id).filter((id): id is number => id != null))];
    const userIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is number => id != null))];
    const branchIds = [...new Set(rows.map((r) => r.branch_id))];
    const [employees, users, branches] = await Promise.all([
      salesIds.length ? this.prisma.employees.findMany({ where: { id: { in: salesIds } }, select: { id: true, employee: true } }) : [],
      userIds.length ? this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }) : [],
      branchIds.length ? this.prisma.tbl_branches.findMany({ where: { branch_id: { in: branchIds } }, select: { branch_id: true, branch_name: true } }) : [],
    ]);
    const salesName = new Map<number, string>(employees.map((e) => [e.id, String(e.employee ?? `#${e.id}`)] as [number, string]));
    const userName = new Map<number, string>(users.map((u) => [u.user_id, String(u.name || u.username || `#${u.user_id}`)] as [number, string]));
    const branchName = new Map<number, string>(branches.map((b) => [b.branch_id, String(b.branch_name ?? `#${b.branch_id}`)] as [number, string]));
    const today = localDateString();
    const statusOf = (row: (typeof rows)[number]) => {
      if (row.status === 'frozen') return 'frozen';
      if (row.subscription_start_date > today) return 'upcoming';
      if (row.subscription_end_date < today) return 'expired';
      return 'active';
    };
    const groups = new Map<string, { id: number | null; name: string; count: number; value: number; discount: number; collected: number; remaining: number; rows: unknown[] }>();
    for (const row of rows) {
      const key = String(row.subscription_type_id ?? row.subscription_type ?? 'unknown');
      const group = groups.get(key) ?? { id: row.subscription_type_id, name: row.subscription_type ?? 'غير محدد', count: 0, value: 0, discount: 0, collected: 0, remaining: 0, rows: [] };
      const value = toNum(row.subscription_value);
      const discount = row.discount_enabled ? toNum(row.discount_value) : 0;
      const collected = toNum(row.paid_amount);
      const remaining = toNum(row.remaining_amount);
      group.count += 1;
      group.value = round2(group.value + value);
      group.discount = round2(group.discount + discount);
      group.collected = round2(group.collected + collected);
      group.remaining = round2(group.remaining + remaining);
      const salesId = row.member?.sales_id ?? null;
      group.rows.push({
        subscriptionNumber: row.subscription_number,
        memberName: row.member?.name ?? row.customer_name ?? '—',
        memberCode: row.member?.member_code ?? null,
        phone: row.member?.phone ?? null,
        registrationDate: row.registration_date,
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
        value,
        discount,
        collected,
        remaining,
        paymentMethod: row.payment_method,
        status: statusOf(row),
        branch: branchName.get(row.branch_id) ?? null,
        sales: salesId != null ? salesName.get(salesId) ?? null : null,
        createdBy: row.created_by != null ? userName.get(row.created_by) ?? null : null,
      });
      groups.set(key, group);
    }
    return {
      period: { startDate, endDate },
      types: [...groups.values()].sort((a, b) => b.value - a.value),
    };
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
      const memberGender = this.memberGender(q, user);
      const where: Prisma.club_membersWhereInput = {
        is_deleted: false,
        sales_id: Number(key),
        created_at: {
          gte: new Date(`${startDate}T00:00:00`),
          lte: new Date(`${endDate}T23:59:59.999`),
        },
        ...(branchIds !== null ? { branch_id: { in: branchIds } } : {}),
        ...(memberGender ? { gender: memberGender } : {}),
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
    const memberGender = this.memberGender(q, user);
    const take = page * pageSize;
    const receiptWhere = this.receiptWhere(q, user);
    const source = q.source && q.source !== 'all' ? q.source : null;
    const sourceReceiptWhere: Prisma.club_receiptsWhereInput =
      source === 'spa' || source === 'subscriptions'
        ? { AND: [receiptWhere, receiptSourceWhere(source)] }
        : receiptWhere;
    const salesMethod = toSalesPaymentMethod(method);
    const [paymentRows, legacyRows, spaRows, inbodyRows, lockerRows] = await Promise.all([
      source && source !== 'subscriptions' && source !== 'spa'
        ? []
        : this.prisma.club_receipt_payments
            .findMany({
              where: { method: method as never, receipt: { is: sourceReceiptWhere } },
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
      source && source !== 'subscriptions' && source !== 'spa'
        ? []
        : this.prisma.club_receipts
            .findMany({
              where: { ...sourceReceiptWhere, payments: { none: {} }, payment_method: method as never },
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
                where: { ...sourceReceiptWhere, payment_method: method as never },
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
              ...(memberGender
                ? { OR: [{ gender: memberGender }, { gender: null, member: { is: { gender: memberGender } } }] }
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
