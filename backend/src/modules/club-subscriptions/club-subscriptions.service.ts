import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClubGender, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { assertMemberExists, localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import {
  addDays,
  daysBetween,
  DEFAULT_SESSION_PACKAGE_DAYS,
  deriveSubStatus,
  isOpenEndedEndDate,
  netValue,
  nextSeqFromMax,
  primaryClubPaymentMethod,
  remainingAmount,
  roundMoney,
  resolveClubPayments,
  resolveSessionMatrixPrice,
  resolveSubscriptionEndDate,
  deriveSessionAwareStatus,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';
import { UpsertClubSubscriptionDto } from './dto/upsert-club-subscription.dto';
import { isSubscriptionTypeAvailableAtBranch } from './subscription-type-branch-scope';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';
import { assertClubAccountingDayOpen } from './daily-close-lock.util';
import { receiptMemberAudienceWhere } from './receipt-business-scope';

@Injectable()
export class ClubSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
    private readonly branchScope: BranchScopeService,
    private readonly permissions: PermissionEngineService,
    private readonly discountCodes: ClubDiscountCodesService,
    @Optional() private readonly lifecycle?: ClubSubscriptionLifecycleService,
  ) {}

  private mapSub(
    row: Record<string, unknown>,
    extras?: {
      salesName?: string | null;
      createdByName?: string | null;
      freezeCreatedByName?: string | null;
    },
  ) {
    const start = row.subscription_start_date as string;
    const end = row.subscription_end_date as string;
    // A frozen subscription must report as frozen regardless of its date range (the stored status
    // column is authoritative for the frozen state; date-derived status applies to the rest).
    const status =
      row.status === 'frozen'
        ? 'frozen'
        : deriveSessionAwareStatus({
            startDate: start,
            endDate: end,
            isLinkedToSessions: !!row.is_linked_to_sessions,
            sessionsCount: row.sessions_count as number | null,
            sessionsUsed: row.sessions_used as number | null,
          });
    const activeFreeze = (row.freezes as Array<{
      id: number;
      freeze_start_date: string;
      freeze_end_date: string | null;
      planned_days: number;
      actual_days: number | null;
      reason: string | null;
      created_by: number | null;
      created_at: Date;
    }> | undefined)?.[0];
    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      registrationDate: row.registration_date,
      branchId: row.branch_id,
      memberId: row.member_id,
      customerName: row.customer_name,
      subscriptionTypeId: row.subscription_type_id,
      specialClassTypeId: row.special_class_type_id,
      privatePackageId: row.private_package_id,
      privateTrainerId: row.private_trainer_id,
      privateDiscountType: row.private_discount_type,
      subscriptionType: row.subscription_type,
      subscriptionStartDate: start,
      subscriptionEndDate: end,
      subscriptionValue: toNum(row.subscription_value),
      discountEnabled: row.discount_enabled,
      discountCodeId: row.discount_code_id ?? null,
      discountPercentage: row.discount_percentage != null ? toNum(row.discount_percentage) : null,
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      waivedAmount: toNum(row.waived_amount),
      transferredCreditAmount: toNum(row.transferred_credit_amount),
      settledAmount: roundMoney(toNum(row.paid_amount) + toNum(row.transferred_credit_amount)),
      remainingAmount: toNum(row.remaining_amount),
      gender: row.gender,
      employeeId: row.employee_id,
      salesId: row.sales_id,
      salesName: extras?.salesName ?? null,
      paymentMethod: row.payment_method,
      receiptNumber: row.receipt_number,
      customerSourceId: row.customer_source_id,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      status,
      isSpecial: row.is_special,
      isLinkedToSessions: row.is_linked_to_sessions,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      allowMultipleDailyEntries: row.allow_multiple_daily_entries,
      isTimeBased: row.is_time_based,
      timeFrom: row.time_from,
      timeTo: row.time_to,
      createdByUserId: row.created_by ?? null,
      createdByName: extras?.createdByName ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeFreeze: activeFreeze
        ? {
            id: activeFreeze.id,
            startDate: activeFreeze.freeze_start_date,
            plannedEndDate: activeFreeze.freeze_end_date,
            plannedDays: activeFreeze.planned_days,
            actualDays: activeFreeze.actual_days,
            reason: activeFreeze.reason,
            createdByUserId: activeFreeze.created_by,
            createdByName: extras?.freezeCreatedByName ?? null,
            createdAt: activeFreeze.created_at,
          }
        : null,
    };
  }

  private async enrichSubNames(rows: Array<{ sales_id: number | null; created_by: number | null }>) {
    const salesIds = [...new Set(rows.map((r) => r.sales_id).filter((id): id is number => id != null))];
    const userIds = [...new Set(rows.flatMap((r) => [
      r.created_by,
      ...((r as typeof r & { freezes?: Array<{ created_by: number | null }> }).freezes ?? [])
        .map((freeze) => freeze.created_by),
    ]).filter((id): id is number => id != null))];
    const [salesEmps, users] = await Promise.all([
      salesIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: salesIds } },
            select: { id: true, employee: true },
          })
        : [],
      userIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, name: true },
          })
        : [],
    ]);
    return {
      salesNameById: new Map<number, string | null>(
        salesEmps.map((e) => [e.id, e.employee ?? null] as const),
      ),
      userNameById: new Map<number, string | null>(
        users.map((u) => [u.user_id, u.name ?? null] as const),
      ),
    };
  }

  private specialSubscriptionFilter(): Prisma.club_subscriptionsWhereInput {
    return {
      OR: [{ is_special: true }, { type: { is_special_offer: true } }],
    };
  }

  /**
   * Keep archived-member history available by direct ID/audit access, but exclude it from normal
   * subscription management lists and totals. This keeps إجمالي المدفوع / المتبقي aligned with
   * the members that management can currently see.
   */
  private visibleMemberSubscriptionFilter(): Prisma.club_subscriptionsWhereInput {
    return {
      OR: [
        { member_id: null },
        { member: { is_deleted: false } },
      ],
    };
  }

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private audience(user?: JwtUser): ClubGender | null {
    return this.branchScope.memberGenderFilter(user) as ClubGender | null;
  }

  private async assertSubscriptionAccess(
    user: JwtUser | undefined,
    subscription: { branch_id: number; member_id: number | null; gender: ClubGender | null },
  ) {
    this.assertBranchAccess(user, subscription.branch_id);
    const audience = this.audience(user);
    const member = subscription.member_id == null
      ? null
      : await this.prisma.club_members.findUnique({
          where: { id: subscription.member_id },
          select: { gender: true, is_deleted: true },
        });
    if (audience && (!member || member.is_deleted || member.gender !== audience)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا القسم');
    }
    return member?.gender ?? subscription.gender;
  }

  /** Prevent a member from holding the same live package/class entitlement twice. */
  private async assertNoDuplicateLiveSubscription(
    data: UpsertClubSubscriptionDto,
    excludeSubscriptionId?: number,
  ) {
    if (!data.memberId) return;

    const identity: Prisma.club_subscriptionsWhereInput | null = data.specialClassTypeId
      ? { special_class_type_id: data.specialClassTypeId }
      : data.subscriptionTypeId
        ? { subscription_type_id: data.subscriptionTypeId }
        : data.subscriptionType?.trim()
          ? { subscription_type: data.subscriptionType.trim() }
          : null;
    if (!identity) return;

    const existing = await this.prisma.club_subscriptions.findMany({
      where: {
        member_id: data.memberId,
        ...identity,
        ...(excludeSubscriptionId ? { id: { not: excludeSubscriptionId } } : {}),
      },
      select: {
        status: true,
        subscription_start_date: true,
        subscription_end_date: true,
        is_linked_to_sessions: true,
        sessions_count: true,
        sessions_used: true,
      },
    });

    const hasLiveDuplicate = existing.some((subscription) => {
      if (subscription.status === 'frozen') return true;
      return deriveSessionAwareStatus({
        startDate: subscription.subscription_start_date,
        endDate: subscription.subscription_end_date,
        isLinkedToSessions: subscription.is_linked_to_sessions,
        sessionsCount: subscription.sessions_count,
        sessionsUsed: subscription.sessions_used,
      }) !== 'expired';
    });

    if (hasLiveDuplicate) {
      throw new BadRequestException('العضو مشترك بالفعل في هذا الاشتراك');
    }
  }

  async list(q: ListClubSubscriptionsDto, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [
      this.visibleMemberSubscriptionFilter(),
    ];

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
          { subscription_type: { contains: s } },
          { receipt_number: { contains: s } },
        ],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    // Default a branch-scoped user to their allowed branches (intersects any explicit filter).
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.subscriptionType) and.push({ subscription_type: { contains: q.subscriptionType } });
    const audience = this.audience(user);
    if (audience) {
      and.push({ member: { is: { is_deleted: false, gender: audience } } });
    } else if (q.gender === 'male' || q.gender === 'female') {
      and.push({ member: { is: { is_deleted: false, gender: q.gender as ClubGender } } });
    }
    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    if (q.memberName) and.push({ customer_name: { contains: q.memberName } });
    if (q.receiptNumber) and.push({ receipt_number: { contains: q.receiptNumber } });
    if (q.isSpecial === 'true' || q.isSpecial === '1') and.push(this.specialSubscriptionFilter());
    if (q.isSpecial === 'false' || q.isSpecial === '0') {
      and.push({
        AND: [
          { is_special: false },
          { OR: [{ subscription_type_id: null }, { type: { is_special_offer: false } }] },
        ],
      });
    }
    if (q.hasDiscount === 'true' || q.hasDiscount === '1') and.push({ discount_enabled: true });
    if (q.isTimeBased === 'true' || q.isTimeBased === '1') and.push({ is_time_based: true });
    if (q.endDateFrom) and.push({ subscription_end_date: { gte: q.endDateFrom } });
    if (q.endDateTo) and.push({ subscription_end_date: { lte: q.endDateTo } });
    if (q.startDateFrom) and.push({ subscription_start_date: { gte: q.startDateFrom } });
    if (q.startDateTo) and.push({ subscription_start_date: { lte: q.startDateTo } });
    if (q.expiresWithinDays) {
      const days = Number(q.expiresWithinDays);
      if (Number.isFinite(days) && days >= 0) {
        const today = localDateString();
        const target = new Date();
        target.setDate(target.getDate() + days);
        const targetIso = target.toISOString().slice(0, 10);
        and.push({ subscription_end_date: { gte: today, lte: targetIso } });
      }
    }

    // Translate the derived-status filter into date predicates so it runs in SQL BEFORE
    // pagination — filtering an already-paginated page corrupts both the page and the total.
    // Mirrors deriveSubStatus: upcoming = start > today, expired = end < today, active otherwise.
    if (q.status && q.status !== 'all') {
      const today = localDateString();
      if (q.status === 'frozen') {
        // Frozen is a stored-column state, not a date-derived one.
        and.push({ status: 'frozen' });
      } else if (q.status === 'upcoming') {
        and.push({ subscription_start_date: { gt: today }, status: { not: 'frozen' } });
      } else if (q.status === 'expired') {
        and.push({ subscription_end_date: { lt: today }, status: { not: 'frozen' } });
      } else if (q.status === 'active') {
        and.push({
          subscription_start_date: { lte: today },
          subscription_end_date: { gte: today },
          status: { not: 'frozen' },
        });
      }
    }

    const where: Prisma.club_subscriptionsWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where,
        include: {
          freezes: {
            where: { is_active: true },
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_subscriptions.count({ where }),
    ]);

    const { salesNameById, userNameById } = await this.enrichSubNames(rows);
    const data = rows.map((r) =>
      this.mapSub(r, {
        salesName: r.sales_id ? salesNameById.get(r.sales_id) ?? null : null,
        createdByName: r.created_by ? userNameById.get(r.created_by) ?? null : null,
        freezeCreatedByName: r.freezes[0]?.created_by
          ? userNameById.get(r.freezes[0].created_by) ?? null
          : null,
      }),
    );
    return paginated(data, total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الاشتراك غير موجود');
    await this.assertSubscriptionAccess(user, row);
    return this.mapSub(row);
  }

  /**
   * Today's subscription activity for the cashier who entered it.
   *
   * Regular users are always forced to their own user id. A system administrator may view one
   * user or everyone. The server owns this scope so changing query parameters in the browser
   * cannot reveal another cashier's activity.
   */
  async dailyCashierReport(user: JwtUser, requestedUserId?: string) {
    const today = localDateString();
    const isSystemAdmin = await this.permissions.isSuperAdmin(user.sub);
    const parsedUserId = Number(requestedUserId);
    const selectedUserId =
      isSystemAdmin && Number.isInteger(parsedUserId) && parsedUserId > 0
        ? parsedUserId
        : isSystemAdmin
          ? null
          : user.sub;
    const allowedBranchIds = isSystemAdmin
      ? null
      : this.branchScope.resolveListFilter(user, null);
    const audience = this.audience(user);

    const subscriptionWhere: Prisma.club_subscriptionsWhereInput = {
      registration_date: today,
      // An entitlement moved from another member is not a new cashier sale.
      transferred_credit_amount: 0,
      ...(selectedUserId != null ? { created_by: selectedUserId } : {}),
      ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
      ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}),
    };
    const receiptWhere: Prisma.club_receiptsWhereInput = {
      receipt_date: today,
      status: { in: ['مدفوعة', 'paid'] },
      ...(selectedUserId != null ? { created_by: selectedUserId } : {}),
      subscription: {
        is: {
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
          ...(audience
            ? { member: { is: { is_deleted: false, gender: audience } } }
            : {}),
        },
      },
    };

    const [subscriptions, receipts, accounts] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: subscriptionWhere,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_receipts.findMany({
        where: receiptWhere,
        select: { amount: true },
      }),
      this.prisma.users.findMany({
        where: isSystemAdmin
          ? { approved: 1 }
          : { user_id: user.sub },
        select: { user_id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const accountById = new Map(accounts.map((row) => [row.user_id, row]));
    const displayName = (userId: number | null) => {
      if (userId == null) return 'غير محدد';
      const account = accountById.get(userId);
      return account?.name || account?.username || `#${userId}`;
    };

    const rows = subscriptions.map((row) => {
      const mapped = this.mapSub(row, { createdByName: displayName(row.created_by) });
      return {
        id: mapped.id,
        subscriptionNumber: mapped.subscriptionNumber,
        customerName: mapped.customerName,
        subscriptionType: mapped.subscriptionType,
        subscriptionValue: mapped.subscriptionValue,
        paidAmount: mapped.paidAmount,
        remainingAmount: mapped.remainingAmount,
        status: mapped.status,
        createdAt: mapped.createdAt,
        createdByUserId: mapped.createdByUserId,
        createdByName: mapped.createdByName,
      };
    });

    return {
      date: today,
      isSystemAdmin,
      lockedUser: !isSystemAdmin,
      selectedUserId,
      selectedUserName:
        selectedUserId == null ? 'كل المستخدمين' : displayName(selectedUserId),
      users: isSystemAdmin
        ? accounts
            .map((account) => ({ id: account.user_id, name: displayName(account.user_id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
        : [{ id: user.sub, name: displayName(user.sub) }],
      summary: {
        subscriptionsCount: rows.length,
        totalValue: rows.reduce((sum, row) => sum + row.subscriptionValue, 0),
        paidAmount: rows.reduce((sum, row) => sum + row.paidAmount, 0),
        collectedToday: receipts.reduce((sum, row) => sum + toNum(row.amount), 0),
        remainingAmount: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
      },
      rows,
    };
  }

  /**
   * Subscription activity by the system user who actually performed it.
   * Subscription creation and cash collection are kept as separate measures: a later installment
   * or renewal may be collected by a different user than the one who opened the subscription.
   */
  async userAnalytics(
    q: { startDate?: string; endDate?: string; branch?: string; gender?: string },
    user?: JwtUser,
  ) {
    const today = localDateString();
    const startDate = q.startDate || `${today.slice(0, 8)}01`;
    const endDate = q.endDate || today;
    assertDateOrder(startDate, endDate);

    const branchIds = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (q.gender && q.gender !== 'male' && q.gender !== 'female') {
      throw new BadRequestException('القسم غير صحيح');
    }
    const lockedAudience = this.audience(user);
    if (lockedAudience && q.gender && q.gender !== lockedAudience) {
      throw new BadRequestException('لا يمكن تغيير قسم البيانات المسموح به');
    }
    const audience = lockedAudience ?? (q.gender as ClubGender | undefined);
    const subscriptionWhere: Prisma.club_subscriptionsWhereInput = {
      created_by: { not: null },
      registration_date: { gte: startDate, lte: endDate },
      // Keep non-cash member-to-member transfers out of sales/user-performance metrics.
      transferred_credit_amount: 0,
      ...(branchIds ? { branch_id: { in: branchIds } } : {}),
      ...(audience ? { member: { is: { is_deleted: false, gender: audience } } } : {}),
    };
    const receiptAnd: Prisma.club_receiptsWhereInput[] = [];
    if (branchIds) receiptAnd.push({ subscription: { is: { branch_id: { in: branchIds } } } });
    if (audience) {
      receiptAnd.push(receiptMemberAudienceWhere(audience));
    }
    const receiptWhere: Prisma.club_receiptsWhereInput = {
      created_by: { not: null },
      receipt_date: { gte: startDate, lte: endDate },
      status: { in: ['مدفوعة', 'paid'] },
      ...(receiptAnd.length ? { AND: receiptAnd } : {}),
    };

    const [subscriptionGroups, receiptGroups, subscriptionDetails, receiptDetails] = await Promise.all([
      this.prisma.club_subscriptions.groupBy({
        by: ['created_by'],
        where: subscriptionWhere,
        _count: { _all: true },
        _sum: { subscription_value: true },
      }),
      this.prisma.club_receipts.groupBy({
        by: ['created_by'],
        where: receiptWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.club_subscriptions.findMany({
        where: subscriptionWhere,
        select: {
          id: true,
          subscription_number: true,
          registration_date: true,
          subscription_type: true,
          subscription_value: true,
          paid_amount: true,
          branch_id: true,
          member_id: true,
          customer_name: true,
          created_by: true,
          created_at: true,
          member: { select: { member_code: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.club_receipts.findMany({
        where: receiptWhere,
        select: {
          id: true,
          receipt_number: true,
          receipt_date: true,
          amount: true,
          member_id: true,
          member_name: true,
          created_by: true,
          created_at: true,
          member: { select: { member_code: true, name: true } },
          subscription: {
            select: {
              id: true,
              subscription_number: true,
              subscription_type: true,
              subscription_value: true,
              branch_id: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const userIds = [
      ...new Set(
        [...subscriptionGroups, ...receiptGroups]
          .map((row) => row.created_by)
          .filter((id): id is number => id != null),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, name: true, username: true },
        })
      : [];
    const userById = new Map(users.map((row) => [row.user_id, row]));
    const subscriptionsByUser = new Map(
      subscriptionGroups
        .filter((row): row is typeof row & { created_by: number } => row.created_by != null)
        .map((row) => [row.created_by, row]),
    );
    const receiptsByUser = new Map(
      receiptGroups
        .filter((row): row is typeof row & { created_by: number } => row.created_by != null)
        .map((row) => [row.created_by, row]),
    );

    const data = userIds
      .map((userId) => {
        const account = userById.get(userId);
        const subscriptions = subscriptionsByUser.get(userId);
        const receipts = receiptsByUser.get(userId);
        return {
          userId,
          userName: account?.name || account?.username || `#${userId}`,
          subscriptionsCount: subscriptions?._count._all ?? 0,
          subscriptionsValue: toNum(subscriptions?._sum.subscription_value),
          receiptsCount: receipts?._count._all ?? 0,
          collectedAmount: toNum(receipts?._sum.amount),
        };
      })
      .sort((a, b) => b.collectedAmount - a.collectedAmount || b.subscriptionsCount - a.subscriptionsCount);

    const branchIdsInDetails = [
      ...new Set([
        ...subscriptionDetails.map((row) => row.branch_id),
        ...receiptDetails
          .map((row) => row.subscription?.branch_id)
          .filter((id): id is number => id != null),
      ]),
    ];
    const branchRows = branchIdsInDetails.length
      ? await this.prisma.tbl_branches.findMany({
          where: { branch_id: { in: branchIdsInDetails } },
          select: { branch_id: true, branch_name: true },
        })
      : [];
    const branchNameById = new Map(branchRows.map((row) => [row.branch_id, row.branch_name]));
    const userName = (userId: number | null) => {
      if (userId == null) return '—';
      const account = userById.get(userId);
      return account?.name || account?.username || `#${userId}`;
    };

    const activities = [
      ...subscriptionDetails.map((row) => ({
        id: `subscription:${row.id}`,
        activityType: 'subscription' as const,
        activityLabel: 'اشتراك جديد',
        userId: row.created_by,
        userName: userName(row.created_by),
        memberId: row.member_id,
        memberCode: row.member?.member_code ?? null,
        memberName: row.member?.name ?? row.customer_name ?? '—',
        subscriptionId: row.id,
        subscriptionNumber: row.subscription_number,
        subscriptionType: row.subscription_type ?? '—',
        registrationDate: row.registration_date,
        occurredAt: row.created_at.toISOString(),
        subscriptionValue: toNum(row.subscription_value),
        // Collection is represented by its receipt activity below. Keeping this at zero avoids
        // counting the initial payment twice in the detailed report.
        collectedAmount: 0,
        branchId: row.branch_id,
        branchName: branchNameById.get(row.branch_id) ?? null,
      })),
      ...receiptDetails.map((row) => ({
        id: `receipt:${row.id}`,
        activityType: 'receipt' as const,
        activityLabel: 'تحصيل دفعة',
        userId: row.created_by,
        userName: userName(row.created_by),
        memberId: row.member_id,
        memberCode: row.member?.member_code ?? null,
        memberName: row.member?.name ?? row.member_name,
        subscriptionId: row.subscription?.id ?? null,
        subscriptionNumber: row.subscription?.subscription_number ?? row.receipt_number,
        subscriptionType: row.subscription?.subscription_type ?? '—',
        registrationDate: row.receipt_date,
        occurredAt: row.created_at.toISOString(),
        subscriptionValue: row.subscription ? toNum(row.subscription.subscription_value) : 0,
        collectedAmount: toNum(row.amount),
        branchId: row.subscription?.branch_id ?? null,
        branchName:
          row.subscription?.branch_id != null
            ? branchNameById.get(row.subscription.branch_id) ?? null
            : null,
      })),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    return {
      data,
      activities,
      totals: {
        usersCount: data.length,
        subscriptionsCount: data.reduce((sum, row) => sum + row.subscriptionsCount, 0),
        subscriptionsValue: data.reduce((sum, row) => sum + row.subscriptionsValue, 0),
        receiptsCount: data.reduce((sum, row) => sum + row.receiptsCount, 0),
        collectedAmount: data.reduce((sum, row) => sum + row.collectedAmount, 0),
      },
    };
  }

  private async generateSubNumber(): Promise<string> {
    // Serialize concurrent creates on a named advisory lock so two requests can't read the same
    // MAX and mint the same SUB###### (same pattern as club-lockers' generateLockNumber). Runs in
    // a transaction so GET_LOCK/RELEASE_LOCK hit the same pooled connection.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('club_sub_number', 10)`;
      try {
        const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
          SELECT MAX(CAST(SUBSTRING(subscription_number, 4) AS UNSIGNED)) AS maxNum
          FROM club_subscriptions WHERE subscription_number LIKE 'SUB%'
        `;
        const next = nextSeqFromMax(rows[0]?.maxNum);
        return `SUB${String(next).padStart(6, '0')}`;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('club_sub_number')`;
      }
    });
  }

  /**
   * Subscription number for a member mirrors the member's own code (e.g. member A000123 →
   * subscription A000123). Because a member can hold several subscriptions over time (a new row
   * per renewal-as-new / re-subscribe) and subscription_number is unique, the first one takes the
   * bare member code and each subsequent one gets a `-N` suffix (A000123-2, A000123-3 …).
   * Walk-ins with no member fall back to the sequential SUB###### format.
   */
  private async generateSubNumberForMember(memberId: number | null): Promise<string> {
    if (memberId == null) return this.generateSubNumber();
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { member_code: true },
    });
    const code = member?.member_code?.trim();
    if (!code) return this.generateSubNumber();

    // Serialize on the same advisory lock generateSubNumber uses so concurrent creates for the
    // same member can't both read the same set and mint a duplicate number.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('club_sub_number', 10)`;
      try {
        const taken = await tx.club_subscriptions.findMany({
          where: {
            OR: [{ subscription_number: code }, { subscription_number: { startsWith: `${code}-` } }],
          },
          select: { subscription_number: true },
        });
        const used = new Set(taken.map((r) => r.subscription_number));
        if (!used.has(code)) return code;
        let n = 2;
        while (used.has(`${code}-${n}`)) n += 1;
        return `${code}-${n}`;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('club_sub_number')`;
      }
    });
  }

  async create(
    dto: UpsertClubSubscriptionDto,
    userOrId: JwtUser | number,
    internal?: { privateEnrollment?: boolean },
  ) {
    const user = typeof userOrId === 'number' ? undefined : userOrId;
    const userId = typeof userOrId === 'number' ? userOrId : userOrId.sub;
    const carriesPrivateFields =
      dto.privatePackageId != null ||
      dto.privateTrainerId != null ||
      dto.privateDiscountType != null;
    if (carriesPrivateFields && !internal?.privateEnrollment) {
      throw new BadRequestException('استخدم مسار اشتراكات البرايفت المخصص');
    }
    let data: UpsertClubSubscriptionDto = {
      ...dto,
      // Public callers cannot self-label an arbitrary subscription as special. The private
      // service is the only internal caller allowed to preserve this flag after validating the
      // package, trainer and branch.
      isSpecial: internal?.privateEnrollment ? true : false,
    };

    // Special subscriptions are session entitlements for one class type. The buyer may choose
    // fewer sessions than the configured package, never more than its original allowance.
    if (data.startDate && data.specialClassTypeId && data.memberId) {
      const member = await assertMemberExists(this.prisma, data.memberId).catch((e) => {
        throw new BadRequestException(e.message);
      });
      const [classType, mem] = await Promise.all([
        this.prisma.club_class_types.findFirst({
          where: { id: data.specialClassTypeId, is_deleted: false, is_active: true },
        }),
        this.prisma.club_members.findUnique({ where: { id: member.id } }),
      ]);
      if (!classType) throw new BadRequestException('الاشتراك الخاص غير موجود أو غير نشط');
      const sessionsCount = Number(data.sessionsCount);
      const maxSessions = Math.max(1, classType.subscription_sessions_count);
      if (!Number.isInteger(sessionsCount) || sessionsCount < 1 || sessionsCount > maxSessions) {
        throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${maxSessions}`);
      }
      const validityDays = Number(data.validityDays);
      if (!Number.isInteger(validityDays) || validityDays < 1) {
        throw new BadRequestException('مدة صلاحية الاشتراك يجب أن تكون رقمًا صحيحًا أكبر من صفر');
      }

      data = {
        ...data,
        branchId: mem?.branch_id ?? data.branchId,
        customerName: data.customerName ?? member.name,
        subscriptionTypeId: undefined,
        subscriptionType: classType.name,
        subscriptionValue: toNum(classType.single_session_price) * sessionsCount,
        subscriptionStartDate: data.startDate,
        subscriptionEndDate: addDays(data.startDate, validityDays),
        isSpecial: true,
        isLinkedToSessions: true,
        sessionsCount,
        allowMultipleDailyEntries: true,
        gender: data.gender ?? mem?.gender ?? undefined,
        guardianName: data.guardianName ?? mem?.guardian_name ?? undefined,
        guardianPhone: data.guardianPhone ?? mem?.guardian_phone ?? undefined,
        employeeId: data.employeeId ?? mem?.employee_id ?? undefined,
        salesId: data.salesId ?? mem?.sales_id ?? undefined,
      };
    }

    // Short format: startDate + subscriptionTypeId. Registered members inherit their profile;
    // walk-ins keep the explicitly supplied customer/branch fields.
    if (data.startDate && data.subscriptionTypeId && !data.subscriptionEndDate) {
      const member = data.memberId
        ? await assertMemberExists(this.prisma, data.memberId).catch((e) => {
            throw new BadRequestException(e.message);
          })
        : null;
      const type = await this.prisma.club_subscription_types.findUnique({
        where: { id: data.subscriptionTypeId },
        include: {
          session_prices: {
            select: { sessions_count: true, price: true },
            orderBy: { sessions_count: 'asc' },
          },
        },
      });
      if (!type) throw new BadRequestException('نوع الاشتراك غير موجود');
      const mem = member
        ? await this.prisma.club_members.findUnique({ where: { id: member.id } })
        : null;
      let sessionsCount: number | undefined;
      let subscriptionValue = toNum(type.price);
      if (type.is_linked_to_sessions) {
        const packageSessions = Number(type.sessions_count);
        if (!Number.isInteger(packageSessions) || packageSessions < 1) {
          throw new BadRequestException('عدد حصص الباقة غير مضبوط');
        }
        sessionsCount = data.sessionsCount ?? packageSessions;
        if (!Number.isInteger(sessionsCount) || sessionsCount < 1 || sessionsCount > packageSessions) {
          throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${packageSessions}`);
        }
        const matrix = (type.session_prices ?? []).map((row) => ({
          sessionsCount: row.sessions_count,
          price: toNum(row.price),
        }));
        subscriptionValue = resolveSessionMatrixPrice({
          packagePrice: toNum(type.price),
          maxSessions: packageSessions,
          selectedSessions: sessionsCount,
          matrix,
        });
      }
      data = {
        ...data,
        customerName: data.customerName ?? member?.name,
        subscriptionValue,
        subscriptionType: type.name,
        subscriptionStartDate: data.startDate,
        subscriptionEndDate: resolveSubscriptionEndDate(
          data.startDate,
          type.days,
          type.is_linked_to_sessions,
        ),
        isLinkedToSessions: type.is_linked_to_sessions,
        sessionsCount: type.is_linked_to_sessions ? sessionsCount : undefined,
        allowMultipleDailyEntries: type.allow_multiple_daily_entries,
        gender: data.gender ?? mem?.gender ?? undefined,
        guardianName: data.guardianName ?? mem?.guardian_name ?? undefined,
        guardianPhone: data.guardianPhone ?? mem?.guardian_phone ?? undefined,
        employeeId: data.employeeId ?? mem?.employee_id ?? undefined,
        salesId: data.salesId ?? mem?.sales_id ?? undefined,
        isSpecial: false,
      };
      if (mem) data.branchId = mem.branch_id;
    }

    if (!data.branchId || !data.customerName || !data.subscriptionStartDate || !data.subscriptionEndDate) {
      throw new BadRequestException('الحقول المطلوبة: الفرع، اسم العميل، تاريخ البداية والنهاية');
    }
    this.assertBranchAccess(user, data.branchId);
    const audience = this.audience(user);
    if (audience) {
      if (data.gender && data.gender !== audience) {
        throw new ForbiddenException('لا تملك صلاحية إنشاء اشتراك في هذا القسم');
      }
      data.gender = audience;
    }

    if (data.subscriptionTypeId) {
      const assignedType = await this.prisma.club_subscription_types.findUnique({
        where: { id: data.subscriptionTypeId },
        select: {
          branch_id: true,
          apply_to_all_branches: true,
          branches: { select: { branch_id: true } },
        },
      });
      if (!assignedType || !isSubscriptionTypeAvailableAtBranch(assignedType, data.branchId)) {
        throw new ForbiddenException('الخطة المختارة غير متاحة في فرع العميل');
      }
    }

    assertDateOrder(data.subscriptionStartDate, data.subscriptionEndDate);

    // Snapshot the package's multiple-daily-entries policy onto the subscription
    // so check-in reads it per-subscription (matches is_linked_to_sessions handling).
    if (data.allowMultipleDailyEntries === undefined && data.subscriptionTypeId) {
      const typeRow = await this.prisma.club_subscription_types.findUnique({
        where: { id: data.subscriptionTypeId },
        select: { allow_multiple_daily_entries: true },
      });
      if (typeRow) data.allowMultipleDailyEntries = typeRow.allow_multiple_daily_entries;
    }

    if (data.memberId) {
      const member = await assertMemberExists(this.prisma, data.memberId).catch((e) => {
        throw new BadRequestException(e.message);
      });
      const memberBranch = await this.prisma.club_members.findUnique({
        where: { id: member.id },
        select: { branch_id: true, gender: true },
      });
      if (!memberBranch || memberBranch.branch_id !== data.branchId) {
        throw new ForbiddenException('لا يمكن إنشاء اشتراك لعضو تابع لفرع آخر');
      }
      this.assertBranchAccess(user, memberBranch.branch_id);
      if (audience && memberBranch.gender !== audience) {
        throw new ForbiddenException('لا تملك صلاحية إنشاء اشتراك لهذا القسم');
      }
      data.gender = memberBranch.gender;
      await this.assertNoDuplicateLiveSubscription(data);
    }

    await assertClubAccountingDayOpen(this.prisma, {
      date: data.registrationDate ?? localDateString(),
      branchId: data.branchId,
      gender: data.gender ?? null,
    });

    const subValue = data.subscriptionValue ?? 0;
    const resolvedDiscount = await this.discountCodes.resolveDiscount({
      subscriptionValue: subValue,
      discountCodeId: data.discountCodeId,
      discountEnabled: data.discountEnabled,
      discountValue: data.discountValue,
      memberId: data.memberId,
    });
    const discountEnabled = resolvedDiscount.discountEnabled;
    const discount = resolvedDiscount.discountValue;
    const paid = data.paidAmount ?? 0;

    if (discountEnabled && discount > subValue) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    const netAfterDiscount = subValue - (discountEnabled ? discount : 0);
    if (paid > netAfterDiscount) {
      throw new BadRequestException('المبلغ المدفوع لا يمكن أن يتجاوز الصافي بعد الخصم');
    }

    // remaining honors discountEnabled (raw subValue−discount−paid double-counts a disabled discount).
    const remaining = remainingAmount(subValue, discountEnabled, discount, paid);

    // Resolved before the transaction so a split that doesn't add up fails fast, before any write.
    const paymentSplits = resolveClubPayments(paid, data.paymentMethod, data.payments);

    // Overlapping live subscriptions are allowed (sessions package + monthly membership together).

    const subNumber = await this.generateSubNumberForMember(data.memberId ?? null);
    const status = deriveSessionAwareStatus({
      startDate: data.subscriptionStartDate,
      endDate: data.subscriptionEndDate,
      isLinkedToSessions: !!data.isLinkedToSessions,
      sessionsCount: data.sessionsCount ?? null,
      sessionsUsed: 0,
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_subscriptions.create({
        data: {
          subscription_number: subNumber,
          registration_date: data.registrationDate ?? localDateString(),
          branch_id: data.branchId!,
          member_id: data.memberId ?? null,
          customer_name: data.customerName!,
          subscription_type_id: data.subscriptionTypeId ?? null,
          special_class_type_id: data.specialClassTypeId ?? null,
          private_package_id: data.privatePackageId ?? null,
          private_trainer_id: data.privateTrainerId ?? null,
          private_discount_type: data.privateDiscountType?.trim() || null,
          subscription_type: data.subscriptionType ?? null,
          subscription_start_date: data.subscriptionStartDate!,
          subscription_end_date: data.subscriptionEndDate!,
          subscription_value: subValue,
          discount_enabled: discountEnabled,
          discount_code_id: resolvedDiscount.discountCodeId,
          discount_percentage: resolvedDiscount.discountPercentage,
          discount_value: discount,
          paid_amount: paid,
          remaining_amount: remaining,
          gender: data.gender ?? null,
          employee_id: data.employeeId ?? null,
          sales_id: data.salesId ?? null,
          payment_method: primaryClubPaymentMethod(paymentSplits) ?? data.paymentMethod ?? null,
          customer_source_id: data.customerSourceId ?? null,
          guardian_name: data.guardianName ?? null,
          guardian_phone: data.guardianPhone ?? null,
          status,
          is_special: !!data.isSpecial,
          is_linked_to_sessions: !!data.isLinkedToSessions,
          sessions_count: data.isLinkedToSessions ? data.sessionsCount ?? null : null,
          sessions_used: 0,
          allow_multiple_daily_entries: data.allowMultipleDailyEntries ?? false,
          is_time_based: data.isTimeBased ?? false,
          time_from: data.timeFrom ?? null,
          time_to: data.timeTo ?? null,
          created_by: userId,
        },
      });

      if (paid > 0) {
        const receipt = await this.receipts.createForSubscription(
          created.id,
          paid,
          {
            memberName: data.customerName!,
            memberId: data.memberId,
            paymentMethod: data.paymentMethod,
            payments: paymentSplits,
            createdBy: userId,
          },
          tx,
        );
        await this.accounting.postJournal(
          {
            subscriptionNumber: subNumber,
            sourceDocId: receipt?.receipt_number ?? subNumber,
            paidAmount: paid,
            subscriptionValue: subValue,
            discountValue: discount,
            discountEnabled,
            paymentMethod: data.paymentMethod,
            payments: paymentSplits,
            branchId: data.branchId!,
            createdBy: userId,
            registrationDate: created.registration_date,
            kind: 'subscription',
          },
          tx,
        );
      }

      return created;
    }, { maxWait: 10000, timeout: 15000 });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: row.id,
      action: 'create',
      actorUserId: userId,
      branchId: data.branchId,
      after: {
        subscriptionNumber: subNumber,
        customerName: data.customerName,
        memberId: data.memberId,
        subscriptionValue: subValue,
        paidAmount: paid,
      },
    });

    if (row.member_id) {
      await this.syncMemberProfileFromSubscription(row);
    }

    return this.findOne(row.id, user);
  }

  async update(id: number, dto: Partial<UpsertClubSubscriptionDto>, user?: JwtUser) {
    const existing = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الاشتراك غير موجود');
    const accountingGender = await this.assertSubscriptionAccess(user, existing);
    await assertClubAccountingDayOpen(this.prisma, {
      date: existing.registration_date,
      branchId: existing.branch_id,
      gender: accountingGender,
    });

    if (dto.memberId != null) {
      const member = await this.prisma.club_members.findFirst({
        where: { id: dto.memberId, is_deleted: false },
        select: { branch_id: true, gender: true },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');
      this.assertBranchAccess(user, member.branch_id);
      const audience = this.audience(user);
      if (audience && member.gender !== audience) {
        throw new ForbiddenException('لا تملك صلاحية ربط اشتراك بعضو من هذا القسم');
      }
      if (member.branch_id !== existing.branch_id) {
        throw new ForbiddenException('لا يمكن ربط اشتراك بعضو تابع لفرع آخر');
      }
    }

    const start = dto.subscriptionStartDate ?? existing.subscription_start_date;
    let end = dto.subscriptionEndDate ?? existing.subscription_end_date;
    let linkedToSessions = dto.isLinkedToSessions ?? existing.is_linked_to_sessions;
    let resolvedSessionsCount = dto.sessionsCount !== undefined ? dto.sessionsCount : existing.sessions_count;
    const specialClassTypeId = dto.specialClassTypeId !== undefined
      ? dto.specialClassTypeId
      : existing.special_class_type_id;
    const specialClassType = specialClassTypeId
      ? await this.prisma.club_class_types.findFirst({
          where: { id: specialClassTypeId, is_deleted: false, is_active: true },
        })
      : null;
    if (specialClassTypeId && !specialClassType) {
      throw new BadRequestException('الاشتراك الخاص غير موجود أو غير نشط');
    }
    if (specialClassType) {
      linkedToSessions = true;
      const specialChanged = dto.specialClassTypeId !== undefined && dto.specialClassTypeId !== existing.special_class_type_id;
      resolvedSessionsCount = dto.sessionsCount !== undefined
        ? dto.sessionsCount
        : existing.sessions_count ?? 1;
      const maxSessions = Math.max(1, specialClassType.subscription_sessions_count);
      if (
        !Number.isInteger(resolvedSessionsCount) ||
        resolvedSessionsCount < 1 ||
        resolvedSessionsCount > maxSessions
      ) {
        throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${maxSessions}`);
      }
      const startChanged = dto.subscriptionStartDate != null && dto.subscriptionStartDate !== existing.subscription_start_date;
      const previousValidityDays = Math.max(
        1,
        daysBetween(existing.subscription_start_date, existing.subscription_end_date),
      );
      const validityDays = dto.validityDays ?? previousValidityDays;
      if (!Number.isInteger(validityDays) || validityDays < 1) {
        throw new BadRequestException('مدة صلاحية الاشتراك يجب أن تكون رقمًا صحيحًا أكبر من صفر');
      }
      if (dto.subscriptionEndDate == null && (specialChanged || startChanged || dto.validityDays !== undefined)) {
        end = addDays(start, validityDays);
      }
    }
    const selectedTypeId = dto.subscriptionTypeId ?? existing.subscription_type_id;
    const selectedType = !specialClassType && selectedTypeId
      ? await this.prisma.club_subscription_types.findUnique({
          where: { id: selectedTypeId },
          select: {
            is_linked_to_sessions: true,
            sessions_count: true,
            price: true,
            days: true,
            branch_id: true,
            apply_to_all_branches: true,
            branches: { select: { branch_id: true } },
            session_prices: {
              select: { sessions_count: true, price: true },
              orderBy: { sessions_count: 'asc' },
            },
          },
        })
      : null;
    if (dto.subscriptionTypeId != null) {
      if (!selectedType) throw new BadRequestException('نوع الاشتراك غير موجود');
      if (!isSubscriptionTypeAvailableAtBranch(selectedType, existing.branch_id)) {
        throw new ForbiddenException('الخطة المختارة غير متاحة في فرع الاشتراك');
      }
      linkedToSessions = selectedType.is_linked_to_sessions;
      resolvedSessionsCount = selectedType.is_linked_to_sessions
        ? dto.sessionsCount ?? selectedType.sessions_count
        : null;
    }
    if (linkedToSessions && !specialClassType) {
      const startChanged =
        dto.subscriptionStartDate != null &&
        dto.subscriptionStartDate !== existing.subscription_start_date;
      const typeChanged =
        dto.subscriptionTypeId != null && dto.subscriptionTypeId !== existing.subscription_type_id;
      if (dto.subscriptionEndDate != null) {
        end = dto.subscriptionEndDate;
      } else if (startChanged || typeChanged || isOpenEndedEndDate(end)) {
        const typeId = dto.subscriptionTypeId ?? existing.subscription_type_id;
        let typeDays = DEFAULT_SESSION_PACKAGE_DAYS;
        if (typeId) {
          const typeRow = await this.prisma.club_subscription_types.findUnique({
            where: { id: typeId },
            select: { days: true },
          });
          if (typeRow && typeRow.days > 0) typeDays = typeRow.days;
        }
        end = resolveSubscriptionEndDate(start, typeDays, true);
      }
    }
    if (
      linkedToSessions &&
      resolvedSessionsCount != null &&
      resolvedSessionsCount < existing.sessions_used
    ) {
      throw new BadRequestException('عدد الحصص لا يمكن أن يكون أقل من عدد الحصص المستخدمة');
    }
    let subValue = specialClassType
      ? roundMoney(toNum(specialClassType.single_session_price) * (resolvedSessionsCount ?? 1))
      : dto.subscriptionValue ?? toNum(existing.subscription_value);
    if (linkedToSessions && !specialClassType && selectedType) {
      const packageSessions = Number(selectedType.sessions_count);
      if (!Number.isInteger(packageSessions) || packageSessions < 1) {
        throw new BadRequestException('عدد حصص الباقة غير مضبوط');
      }
      const requestedSessions = resolvedSessionsCount ?? packageSessions;
      if (
        !Number.isInteger(requestedSessions) ||
        requestedSessions < 1 ||
        requestedSessions > packageSessions
      ) {
        throw new BadRequestException(`عدد الحصص يجب أن يكون من 1 إلى ${packageSessions}`);
      }
      const matrix = (selectedType.session_prices ?? []).map((row) => ({
        sessionsCount: row.sessions_count,
        price: toNum(row.price),
      }));
      subValue = resolveSessionMatrixPrice({
        packagePrice: toNum(selectedType.price),
        maxSessions: packageSessions,
        selectedSessions: requestedSessions,
        matrix,
      });
    }
    const discountChanged =
      dto.discountCodeId !== undefined ||
      dto.discountEnabled !== undefined ||
      dto.discountValue !== undefined;
    const resolvedDiscount = discountChanged
      ? await this.discountCodes.resolveDiscount({
          subscriptionValue: subValue,
          discountCodeId: dto.discountCodeId,
          discountEnabled: dto.discountEnabled,
          discountValue: dto.discountValue,
          memberId: existing.member_id,
        })
      : {
          discountEnabled: existing.discount_enabled,
          discountCodeId: existing.discount_code_id,
          discountPercentage:
            existing.discount_percentage != null ? toNum(existing.discount_percentage) : null,
          discountValue: toNum(existing.discount_value),
        };
    const discountEnabled = resolvedDiscount.discountEnabled;
    const discount = resolvedDiscount.discountValue;
    const paid = toNum(existing.paid_amount);
    const waived = toNum(existing.waived_amount);
    const transferredCredit = toNum(existing.transferred_credit_amount);
    const netAfterDiscount = subValue - (discountEnabled ? discount : 0);
    if (discountEnabled && discount > subValue) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    if (paid + waived + transferredCredit > netAfterDiscount) {
      throw new BadRequestException('لا يمكن تقليل قيمة الاشتراك عن المبلغ المسدد أو المعفى أو الرصيد المنقول');
    }

    await this.assertNoDuplicateLiveSubscription(
      {
        memberId: dto.memberId ?? existing.member_id ?? undefined,
        specialClassTypeId: specialClassTypeId ?? undefined,
        subscriptionTypeId: specialClassType
          ? undefined
          : dto.subscriptionTypeId ?? existing.subscription_type_id ?? undefined,
        subscriptionType: specialClassType
          ? specialClassType.name
          : dto.subscriptionType ?? existing.subscription_type ?? undefined,
      },
      id,
    );

    const row = await this.prisma.club_subscriptions.update({
      where: { id },
      data: {
        ...(dto.customerName != null ? { customer_name: dto.customerName } : {}),
        ...(dto.subscriptionStartDate != null ? { subscription_start_date: dto.subscriptionStartDate } : {}),
        ...(linkedToSessions || dto.subscriptionEndDate != null
          ? { subscription_end_date: end }
          : {}),
        ...(dto.subscriptionValue != null || linkedToSessions ? { subscription_value: subValue } : {}),
        ...(discountChanged
          ? {
              discount_enabled: resolvedDiscount.discountEnabled,
              discount_code_id: resolvedDiscount.discountCodeId,
              discount_percentage: resolvedDiscount.discountPercentage,
              discount_value: resolvedDiscount.discountValue,
            }
          : {}),
        ...(dto.subscriptionType != null ? { subscription_type: dto.subscriptionType } : {}),
        ...(dto.subscriptionTypeId !== undefined ? { subscription_type_id: dto.subscriptionTypeId } : {}),
        ...(dto.specialClassTypeId !== undefined ? { special_class_type_id: dto.specialClassTypeId } : {}),
        ...(specialClassType
          ? {
              subscription_type_id: null,
              subscription_type: specialClassType.name,
              subscription_value:
                toNum(specialClassType.single_session_price) *
                (resolvedSessionsCount ?? 1),
              is_special: true,
              special_class_type_id: specialClassType.id,
            }
          : {}),
        ...(dto.employeeId !== undefined ? { employee_id: dto.employeeId } : {}),
        ...(dto.salesId !== undefined ? { sales_id: dto.salesId } : {}),
        ...(dto.paymentMethod !== undefined ? { payment_method: dto.paymentMethod } : {}),
        ...(dto.customerSourceId !== undefined ? { customer_source_id: dto.customerSourceId } : {}),
        ...(dto.guardianName !== undefined ? { guardian_name: dto.guardianName } : {}),
        ...(dto.guardianPhone !== undefined ? { guardian_phone: dto.guardianPhone } : {}),
        ...(dto.isSpecial !== undefined ? { is_special: dto.isSpecial } : {}),
        ...(dto.isTimeBased !== undefined ? { is_time_based: dto.isTimeBased } : {}),
        ...(dto.timeFrom !== undefined ? { time_from: dto.timeFrom } : {}),
        ...(dto.timeTo !== undefined ? { time_to: dto.timeTo } : {}),
        is_linked_to_sessions: linkedToSessions,
        sessions_count: linkedToSessions ? resolvedSessionsCount : null,
        ...(dto.memberId !== undefined ? { member_id: dto.memberId } : {}),
        status: deriveSessionAwareStatus({
          startDate: start,
          endDate: end,
          isLinkedToSessions: linkedToSessions,
          sessionsCount: resolvedSessionsCount,
          sessionsUsed: existing.sessions_used,
        }),
        remaining_amount: Math.max(
          0,
          remainingAmount(subValue, discountEnabled, discount, paid) -
            waived -
            transferredCredit,
        ),
      },
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'update',
      branchId: existing.branch_id,
      before: this.mapSub(existing),
      after: this.mapSub(row),
    });

    if (row.member_id) {
      await this.syncMemberProfileFromSubscription(row);
    }

    return this.mapSub(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الاشتراك غير موجود');
    const accountingGender = await this.assertSubscriptionAccess(user, existing);
    await assertClubAccountingDayOpen(this.prisma, {
      date: existing.registration_date,
      branchId: existing.branch_id,
      gender: accountingGender,
    });

    // A subscription with financial history (receipts) or an active/completed refund must not be
    // hard-deleted — deleting would orphan GL entries and drop the audit trail. Direct to refund.
    const [receiptCount, refundCount] = await Promise.all([
      this.prisma.club_receipts.count({ where: { subscription_id: id } }),
      this.prisma.club_subscription_refunds.count({
        where: { subscription_id: id, status: { not: 'cancelled' } },
      }),
    ]);
    if (receiptCount > 0 || refundCount > 0) {
      throw new BadRequestException(
        'لا يمكن حذف اشتراك له إيصالات أو عمليات استرداد — استخدم عملية الاسترداد بدلاً من الحذف',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.deleteMany({ where: { subscription_id: id } });
      await tx.club_subscriptions.delete({ where: { id } });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'delete',
      branchId: existing.branch_id,
      before: this.mapSub(existing),
    });
    return { success: true };
  }

  async patchSessions(id: number, sessionsUsed: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    await this.assertSubscriptionAccess(user, sub);
    const max = sub.sessions_count;
    if (max != null && sessionsUsed > max) {
      throw new BadRequestException('عدد الحصص المستخدمة يتجاوز الحد المسموح');
    }
    const data: Prisma.club_subscriptionsUpdateInput = { sessions_used: sessionsUsed };
    if (sub.sessions_count == null) {
      let sessionsFromType = 10;
      if (sub.subscription_type_id) {
        const type = await this.prisma.club_subscription_types.findUnique({
          where: { id: sub.subscription_type_id },
        });
        if (type?.sessions_count != null) sessionsFromType = type.sessions_count;
      }
      data.sessions_count = sessionsFromType;
      data.is_linked_to_sessions = true;
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.club_subscriptions.update({ where: { id }, data });
      const promotion = this.lifecycle && row.sessions_count != null && row.sessions_used >= row.sessions_count
        ? await this.lifecycle.promoteAfterQuotaExhaustion(id, localDateString(), tx)
        : null;
      return { row, promotion };
    });
    if (result.promotion?.activatedSubscriptionId) {
      await this.lifecycle?.syncActivatedMember(result.promotion.activatedSubscriptionId);
    }
    return this.mapSub(result.row);
  }

  async useSession(id: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    await this.assertSubscriptionAccess(user, sub);
    if (!sub.is_linked_to_sessions && sub.sessions_count == null) {
      throw new BadRequestException('هذا الاشتراك غير مرتبط بحصص');
    }
    const max = sub.sessions_count ?? 0;
    const used = sub.sessions_used ?? 0;
    if (max > 0 && used >= max) {
      throw new BadRequestException('لا توجد حصص متبقية');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.club_subscriptions.update({ where: { id }, data: { sessions_used: used + 1, is_linked_to_sessions: true } });
      const promotion = this.lifecycle && row.sessions_count != null && row.sessions_used >= row.sessions_count
        ? await this.lifecycle.promoteAfterQuotaExhaustion(id, localDateString(), tx)
        : null;
      return { row, promotion };
    });
    if (result.promotion?.activatedSubscriptionId) {
      await this.lifecycle?.syncActivatedMember(result.promotion.activatedSubscriptionId);
    }
    return this.mapSub(result.row);
  }

  async processPayment(
    id: number,
    paymentAmount: number,
    opts?: {
      paymentMethod?: string;
      /** Split `paymentAmount` across methods; must add up to it. */
      payments?: { method: string; amount: number }[];
      user?: JwtUser;
    },
  ) {
    if (paymentAmount <= 0) throw new BadRequestException('مبلغ الدفع غير صالح');
    const { paymentMethod, user } = opts ?? {};
    // Validated up front: a bad split must not reach the advisory lock / receipt insert.
    const paymentSplits = resolveClubPayments(paymentAmount, paymentMethod, opts?.payments);

    const { updated, receiptNumber, sub, prevRemaining, prevPaid } = await this.prisma.$transaction(
      async (tx) => {
        // Serialize concurrent installments on this subscription with a MySQL advisory lock (same
        // pattern as generateSubNumber). A plain findUnique is NOT a locking read, so without this
        // two concurrent payments could both pass the overpay guard and over-collect. GET_LOCK runs
        // on the tx's pooled connection; it is released when the tx connection is returned.
        await tx.$queryRaw`SELECT GET_LOCK(${`club_sub_pay_${id}`}, 10)`;
        try {
          const sub = await tx.club_subscriptions.findUnique({ where: { id } });
          if (!sub) throw new NotFoundException('الاشتراك غير موجود');
          const accountingGender = await this.assertSubscriptionAccess(user, sub);
          await assertClubAccountingDayOpen(tx, {
            date: localDateString(),
            branchId: sub.branch_id,
            gender: accountingGender,
          });

          // Re-read remaining INSIDE the lock so a concurrent payment can't overshoot the balance.
          const prevRemaining = toNum(sub.remaining_amount);
          const prevPaid = toNum(sub.paid_amount);
          if (paymentAmount > prevRemaining) {
            throw new BadRequestException('مبلغ الدفع يتجاوز المبلغ المتبقي');
          }

          const receipt = await retryOnUniqueViolation(async () => {
          const receiptNumber = await this.receipts.nextReceiptNumber(tx);
          return tx.club_receipts.create({
            data: {
              receipt_number: receiptNumber,
              subscription_id: id,
              member_id: sub.member_id,
              member_name: sub.customer_name ?? '',
              amount: paymentAmount,
              type: sub.subscription_type,
              payment_method:
                primaryClubPaymentMethod(paymentSplits) ??
                toClubPaymentMethod(paymentMethod ?? sub.payment_method),
              receipt_date: localDateString(),
              status: 'مدفوعة',
              description: `سداد متبقي اشتراك - ${sub.subscription_type ?? ''}`,
              created_by: user?.sub ?? sub.created_by ?? null,
              payments: {
                create: paymentSplits.map((p) => ({ method: p.method, amount: p.amount })),
              },
            },
          });
        });

        // Recompute paid/remaining from the receipt ledger (single source of truth) within the tx.
        const agg = await tx.club_receipts.aggregate({
          where: { subscription_id: id },
          _sum: { amount: true },
        });
        const paid = toNum(agg._sum.amount);
        const remaining = Math.max(0, remainingAmount(
          toNum(sub.subscription_value),
          sub.discount_enabled,
          toNum(sub.discount_value),
          paid,
        ) - toNum(sub.waived_amount) - toNum(sub.transferred_credit_amount));
        const updated = await tx.club_subscriptions.update({
          where: { id },
          data: { paid_amount: paid, remaining_amount: remaining, receipt_number: receipt.receipt_number },
        });

        // GL: later installment — cash in = revenue, NO discount line (recognized once at creation).
        await this.accounting.postJournal(
          {
            subscriptionNumber: sub.subscription_number,
            sourceDocId: receipt.receipt_number,
            paidAmount: paymentAmount,
            subscriptionValue: toNum(sub.subscription_value),
            discountValue: toNum(sub.discount_value),
            discountEnabled: sub.discount_enabled,
            paymentMethod: paymentMethod ?? sub.payment_method ?? 'cash',
            payments: paymentSplits,
            branchId: sub.branch_id,
            createdBy: user?.sub ?? sub.created_by ?? undefined,
            kind: 'payment',
          },
          tx,
        );

          return { updated, receiptNumber: receipt.receipt_number, sub, prevRemaining, prevPaid };
        } finally {
          await tx.$queryRaw`SELECT RELEASE_LOCK(${`club_sub_pay_${id}`})`;
        }
      },
    );

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'payment',
      branchId: sub.branch_id,
      before: { remainingAmount: prevRemaining, paidAmount: prevPaid },
      after: { paymentAmount, remainingAmount: toNum(updated.remaining_amount), receiptNumber },
    });

    return { subscription: this.mapSub(updated), paymentAmount };
  }

  async processWaiver(
    id: number,
    amount: number,
    reason: string | undefined,
    user?: JwtUser,
  ) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ الإعفاء غير صالح');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK(${`club_sub_waiver_${id}`}, 10)`;
      try {
        const sub = await tx.club_subscriptions.findUnique({
          where: { id },
          include: { member: { select: { name: true } } },
        });
        if (!sub) throw new NotFoundException('الاشتراك غير موجود');
        const accountingGender = await this.assertSubscriptionAccess(user, sub);
        await assertClubAccountingDayOpen(tx, {
          date: localDateString(),
          branchId: sub.branch_id,
          gender: accountingGender,
        });
        const remaining = toNum(sub.remaining_amount);
        if (amount > remaining) throw new BadRequestException('مبلغ الإعفاء يتجاوز المبلغ المتبقي');

        const waiver = await tx.club_subscription_waivers.create({
          data: {
            subscription_id: id,
            member_id: sub.member_id,
            member_name: sub.customer_name ?? sub.member?.name ?? null,
            amount,
            waiver_date: localDateString(),
            reason: reason?.trim() || null,
            created_by: user?.sub ?? null,
          },
        });
        const updated = await tx.club_subscriptions.update({
          where: { id },
          data: {
            waived_amount: { increment: amount },
            remaining_amount: { decrement: amount },
          },
        });
        return { waiver, updated, previousRemaining: remaining };
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${`club_sub_waiver_${id}`})`;
      }
    });

    await this.audit.log({
      entityType: 'club_subscription_waiver',
      entityId: result.waiver.id,
      action: 'create',
      actorUserId: user?.sub,
      branchId: result.updated.branch_id,
      before: { remainingAmount: result.previousRemaining },
      after: {
        subscriptionId: id,
        amount,
        remainingAmount: toNum(result.updated.remaining_amount),
        reason: reason?.trim() || null,
      },
    });

    return { subscription: this.mapSub(result.updated), waiverAmount: amount };
  }

  async waiverReport(query?: {
    dateFrom?: string;
    dateTo?: string;
    branch?: string;
    search?: string;
  }, user?: JwtUser) {
    const and: Prisma.club_subscription_waiversWhereInput[] = [];
    if (query?.dateFrom || query?.dateTo) {
      and.push({
        waiver_date: {
          ...(query.dateFrom ? { gte: query.dateFrom } : {}),
          ...(query.dateTo ? { lte: query.dateTo } : {}),
        },
      });
    }
    if (query?.search?.trim()) {
      const search = query.search.trim();
      and.push({ OR: [{ member_name: { contains: search } }, { reason: { contains: search } }] });
    }
    const requestedBranch = query?.branch && query.branch !== 'all' ? Number(query.branch) : undefined;
    if (requestedBranch) {
      this.assertBranchAccess(user, requestedBranch);
      and.push({ subscription: { branch_id: requestedBranch } });
    } else if (user && user.level !== 1 && user.branch > 0) {
      and.push({ subscription: { branch_id: user.branch } });
    }
    const audience = this.audience(user);
    if (audience) {
      and.push({
        subscription: {
          member: { is: { is_deleted: false, gender: audience } },
        },
      });
    }
    const where: Prisma.club_subscription_waiversWhereInput = and.length ? { AND: and } : {};
    const [rows, aggregate] = await Promise.all([
      this.prisma.club_subscription_waivers.findMany({
        where,
        include: {
          subscription: {
            select: { subscription_number: true, subscription_type: true, branch_id: true },
          },
        },
        orderBy: [{ waiver_date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.club_subscription_waivers.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        subscriptionId: row.subscription_id,
        subscriptionNumber: row.subscription.subscription_number,
        subscriptionType: row.subscription.subscription_type,
        branchId: row.subscription.branch_id,
        memberId: row.member_id,
        memberName: row.member_name,
        amount: toNum(row.amount),
        waiverDate: row.waiver_date,
        reason: row.reason,
        createdBy: row.created_by,
        createdAt: row.created_at,
      })),
      summary: { count: aggregate._count, totalAmount: toNum(aggregate._sum.amount) },
    };
  }

  async renew(
    id: number,
    renewalDays?: number,
    opts?: {
      paidAmount?: number;
      paymentMethod?: string;
      /** Split the up-front renewal payment across methods; must add up to `paidAmount`. */
      payments?: { method: string; amount: number }[];
      dryRun?: boolean;
      user?: JwtUser;
    },
  ) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    const accountingGender = await this.assertSubscriptionAccess(opts?.user, sub);

    if (sub.status === 'frozen') {
      throw new BadRequestException('لا يمكن تجديد اشتراك مجمّد — ألغِ التجميد أولاً');
    }

    const activeFreeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
    });
    if (activeFreeze) {
      throw new BadRequestException('يوجد تجميد نشط — ألغِ التجميد قبل التجديد');
    }

    const today = localDateString();
    await assertClubAccountingDayOpen(this.prisma, {
      date: today,
      branchId: sub.branch_id,
      gender: accountingGender,
    });
    // If the current period hasn't ended yet (end date is today or later — deriveSubStatus keeps
    // the end date itself an active day), the new period starts the day AFTER the current end so
    // already-paid days aren't confiscated. Only an already-expired subscription restarts today.
    const newStart =
      sub.subscription_end_date >= today ? addDays(sub.subscription_end_date, 1) : today;
    const duration =
      renewalDays ??
      daysBetween(sub.subscription_start_date, sub.subscription_end_date);
    if (!Number.isInteger(duration) || duration < 1) {
      throw new BadRequestException('مدة التجديد يجب أن تكون رقمًا صحيحًا أكبر من صفر');
    }
    const newEnd = addDays(newStart, duration);
    const newStatus = deriveSessionAwareStatus({
      startDate: newStart,
      endDate: newEnd,
      isLinkedToSessions: sub.is_linked_to_sessions,
      sessionsCount: sub.sessions_count,
      sessionsUsed: 0,
    });
    const subValue = toNum(sub.subscription_value);
    const discount = toNum(sub.discount_value);
    const paidAmount = Math.max(0, opts?.paidAmount ?? 0);
    if (!Number.isFinite(paidAmount)) {
      throw new BadRequestException('المبلغ المدفوع غير صالح');
    }
    const renewalNetValue = netValue(subValue, sub.discount_enabled, discount);
    if (renewalNetValue < 0) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    if (paidAmount > renewalNetValue) {
      throw new BadRequestException('المبلغ المدفوع لا يمكن أن يتجاوز الصافي بعد الخصم');
    }
    const paymentMethod = opts?.paymentMethod ?? sub.payment_method ?? 'cash';
    // Resolve before any write so an invalid split leaves the database untouched.
    const paymentSplits = resolveClubPayments(paidAmount, paymentMethod, opts?.payments);
    const subNumber = await this.generateSubNumberForMember(sub.member_id);
    const createdBy = opts?.user?.sub ?? sub.created_by ?? null;

    const row = await this.prisma.$transaction(async (tx) => {
      // A renewal is a new accounting period. Keep the original subscription, receipts and GL
      // entries immutable, and create a new subscription row for the renewed entitlement.
      const created = await tx.club_subscriptions.create({
        data: {
          subscription_number: subNumber,
          registration_date: today,
          branch_id: sub.branch_id,
          member_id: sub.member_id,
          customer_name: sub.customer_name,
          subscription_type_id: sub.subscription_type_id,
          special_class_type_id: sub.special_class_type_id,
          subscription_type: sub.subscription_type,
          subscription_start_date: newStart,
          subscription_end_date: newEnd,
          subscription_value: sub.subscription_value,
          discount_enabled: sub.discount_enabled,
          discount_value: sub.discount_value,
          paid_amount: paidAmount,
          waived_amount: 0,
          remaining_amount: remainingAmount(
            subValue,
            sub.discount_enabled,
            discount,
            paidAmount,
          ),
          // Keep the legacy snapshot aligned with the canonical linked member so future
          // audience filters and accounting locks cannot inherit stale historical data.
          gender: accountingGender,
          employee_id: sub.employee_id,
          sales_id: sub.sales_id,
          payment_method:
            primaryClubPaymentMethod(paymentSplits) ??
            toClubPaymentMethod(paymentMethod) ??
            sub.payment_method,
          customer_source_id: sub.customer_source_id,
          guardian_name: sub.guardian_name,
          guardian_phone: sub.guardian_phone,
          status: newStatus,
          is_special: sub.is_special,
          is_linked_to_sessions: sub.is_linked_to_sessions,
          sessions_count: sub.sessions_count,
          sessions_used: 0,
          inbody_used: 0,
          spa_used: 0,
          allow_multiple_daily_entries: sub.allow_multiple_daily_entries,
          is_time_based: sub.is_time_based,
          time_from: sub.time_from,
          time_to: sub.time_to,
          created_by: createdBy,
        },
      });

      // Optional up-front payment for the new period.
      let newReceiptNumber: string | undefined;
      if (paidAmount > 0) {
        const receipt = await this.receipts.createForSubscription(
          created.id,
          paidAmount,
          {
            memberName: sub.customer_name ?? '',
            memberId: sub.member_id ?? undefined,
            type: sub.subscription_type ?? undefined,
            description: `تجديد اشتراك - ${sub.subscription_type ?? ''}`,
            paymentMethod,
            payments: paymentSplits,
            createdBy,
          },
          tx,
        );
        newReceiptNumber = receipt?.receipt_number;
      }

      // GL for the new period. If a payment was made, recognize the discount once (kind 'renewal').
      if (paidAmount > 0) {
        await this.accounting.postJournal(
          {
            subscriptionNumber: subNumber,
            sourceDocId: newReceiptNumber,
            paidAmount,
            subscriptionValue: subValue,
            discountValue: discount,
            discountEnabled: sub.discount_enabled,
            paymentMethod,
            payments: paymentSplits,
            branchId: sub.branch_id,
            createdBy: createdBy ?? undefined,
            registrationDate: today,
            kind: 'renewal',
          },
          tx,
        );
      }

      return tx.club_subscriptions.findUniqueOrThrow({ where: { id: created.id } });
    }, { maxWait: 10000, timeout: 15000 });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: row.id,
      action: 'renew',
      actorUserId: opts?.user?.sub,
      branchId: sub.branch_id,
      before: {
        sourceSubscriptionId: id,
        sourceSubscriptionNumber: sub.subscription_number,
        subscriptionStartDate: sub.subscription_start_date,
        subscriptionEndDate: sub.subscription_end_date,
        status: sub.status,
      },
      after: {
        renewedSubscriptionId: row.id,
        renewedSubscriptionNumber: subNumber,
        subscriptionStartDate: newStart,
        subscriptionEndDate: newEnd,
        status: newStatus,
        renewalPeriod: duration,
      },
    });

    if (sub.member_id) {
      void this.automation.emit('subscription_renewed', {
        memberId: sub.member_id,
        subscriptionId: row.id,
        branchId: sub.branch_id,
        memberName: sub.customer_name ?? '—',
        subscriptionNumber: subNumber,
      });
      // Do not replace an active member profile with a future renewal. Once a renewal starts
      // today (for an expired subscription), it is safe to make it the member's current period.
      if (newStatus === 'active') {
        await this.syncMemberProfileFromSubscription(row);
      }
    }

    return { subscription: this.mapSub(row), renewalPeriod: duration };
  }

  /** Align member profile dates, plan label, and active flag with a linked subscription. */
  private async syncMemberProfileFromSubscription(sub: {
    member_id: number | null;
    subscription_start_date: string;
    subscription_end_date: string;
    subscription_type_id: number | null;
    status: string;
    is_linked_to_sessions?: boolean;
    sessions_count?: number | null;
    sessions_used?: number | null;
  }) {
    if (!sub.member_id) return;

    let membershipTypeId: number | undefined;
    if (sub.subscription_type_id) {
      const st = await this.prisma.club_subscription_types.findUnique({
        where: { id: sub.subscription_type_id },
      });
      if (st) {
        let mt = await this.prisma.club_membership_types.findFirst({
          where: { name: st.name },
        });
        if (!mt) {
          mt = await this.prisma.club_membership_types.create({
            data: {
              name: st.name,
              price: st.price,
              duration_days: st.days,
            },
          });
        } else if (toNum(mt.price) !== toNum(st.price) || mt.duration_days !== st.days) {
          mt = await this.prisma.club_membership_types.update({
            where: { id: mt.id },
            data: { price: st.price, duration_days: st.days },
          });
        }
        membershipTypeId = mt.id;
      }
    }

    const today = localDateString();
    const isSessions = !!sub.is_linked_to_sessions;
    const openEnded = isOpenEndedEndDate(sub.subscription_end_date);
    const active =
      sub.status !== 'expired' &&
      sub.status !== 'frozen' &&
      (isSessions
        ? sub.subscription_start_date <= today &&
          (openEnded || sub.subscription_end_date >= today) &&
          (sub.sessions_count == null || (sub.sessions_used ?? 0) < sub.sessions_count)
        : sub.subscription_end_date >= today);

    await this.prisma.club_members.update({
      where: { id: sub.member_id },
      data: {
        start_date: sub.subscription_start_date,
        // Don't stamp the legacy open-ended sentinel onto the member profile.
        ...(openEnded ? {} : { end_date: sub.subscription_end_date }),
        is_active: active,
        ...(membershipTypeId != null ? { membership_type_id: membershipTypeId } : {}),
      },
    });
  }

  async freeze(id: number, days?: number, reason?: string, userId?: number, user?: JwtUser) {
    // Optional planned days (legacy). Prefer open-ended freeze: staff unfreezes when ready;
    // remaining subscription time is preserved by extending the end date on unfreeze.
    const plannedDays =
      days != null && Number.isFinite(Number(days)) && Number(days) > 0
        ? Math.floor(Number(days))
        : 0;

    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    await this.assertSubscriptionAccess(user, sub);

    if (sub.status === 'frozen') {
      throw new BadRequestException('الاشتراك مجمّد بالفعل');
    }
    // Only a currently date-active subscription can be frozen.
    if (deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date) !== 'active') {
      throw new BadRequestException('لا يمكن تجميد اشتراك غير نشط');
    }
    const existingFreeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
    });
    if (existingFreeze) {
      throw new BadRequestException('يوجد تجميد نشط لهذا الاشتراك بالفعل');
    }

    if (sub.subscription_type_id) {
      const type = await this.prisma.club_subscription_types.findUnique({
        where: { id: sub.subscription_type_id },
      });
      if (type && !type.is_linked_to_freeze) {
        throw new BadRequestException('نوع الاشتراك لا يدعم التجميد');
      }
      // freeze_days on the package = max number of freeze times (not total freeze days).
      if (type?.freeze_days != null) {
        const usedCount = await this.prisma.club_subscription_freezes.count({
          where: { subscription_id: id },
        });
        if (usedCount >= type.freeze_days) {
          throw new BadRequestException(
            `تم استنفاذ عدد مرات التجميد المسموح بها (${type.freeze_days})`,
          );
        }
      }
    }

    const today = localDateString();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.create({
        data: {
          subscription_id: id,
          freeze_start_date: today,
          freeze_end_date: plannedDays > 0 ? addDays(today, plannedDays) : null,
          planned_days: plannedDays,
          original_end_date: sub.subscription_end_date,
          reason: reason ?? null,
          is_active: true,
          branch_id: sub.branch_id,
          created_by: userId ?? null,
        },
      });
      return tx.club_subscriptions.update({
        where: { id },
        data: { status: 'frozen' },
      });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'freeze',
      actorUserId: userId,
      branchId: sub.branch_id,
      before: { status: sub.status, subscriptionEndDate: sub.subscription_end_date },
      after: { status: 'frozen', plannedDays, reason },
    });

    return this.mapSub(row);
  }

  async unfreeze(id: number, userId?: number, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    await this.assertSubscriptionAccess(user, sub);

    const freeze = await this.prisma.club_subscription_freezes.findFirst({
      where: { subscription_id: id, is_active: true },
      orderBy: { id: 'desc' },
    });
    if (!freeze) {
      throw new BadRequestException('لا يوجد تجميد نشط لهذا الاشتراك');
    }

    const today = localDateString();
    // Pause the clock: extend end date by the days actually frozen so remaining time is unchanged.
    // Example: 30 days left → freeze 7 days → unfreeze → still 30 days left.
    const actualDays = Math.max(0, daysBetween(freeze.freeze_start_date, today));
    const baseEnd = freeze.original_end_date || sub.subscription_end_date;
    const newEnd = isOpenEndedEndDate(baseEnd) ? baseEnd : addDays(baseEnd, actualDays);
    const newStatus = deriveSessionAwareStatus({
      startDate: sub.subscription_start_date,
      endDate: newEnd,
      isLinkedToSessions: sub.is_linked_to_sessions,
      sessionsCount: sub.sessions_count,
      sessionsUsed: sub.sessions_used,
    });

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.club_subscription_freezes.update({
        where: { id: freeze.id },
        data: { is_active: false, freeze_end_date: today, actual_days: actualDays },
      });
      return tx.club_subscriptions.update({
        where: { id },
        data: { subscription_end_date: newEnd, status: newStatus },
      });
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'unfreeze',
      actorUserId: userId,
      branchId: sub.branch_id,
      before: { status: 'frozen', subscriptionEndDate: sub.subscription_end_date },
      after: { status: newStatus, subscriptionEndDate: newEnd, actualDays },
    });

    return this.mapSub(row);
  }

  async transferMember(id: number, memberId: number, user?: JwtUser) {
    const [sub, member] = await Promise.all([
      this.prisma.club_subscriptions.findUnique({ where: { id } }),
      this.prisma.club_members.findUnique({ where: { id: memberId } }),
    ]);
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    if (!member) throw new NotFoundException('العضو غير موجود');
    await this.assertSubscriptionAccess(user, sub);
    this.assertBranchAccess(user, member.branch_id);
    const audience = this.audience(user);
    if (audience && member.gender !== audience) {
      throw new ForbiddenException('لا تملك صلاحية نقل الاشتراك إلى عضو من هذا القسم');
    }
    if (member.branch_id !== sub.branch_id) {
      throw new ForbiddenException('لا يمكن نقل الاشتراك إلى عضو تابع لفرع آخر');
    }

    await assertMemberExists(this.prisma, memberId).catch((e) => {
      throw new BadRequestException(e.message);
    });

    const row = await this.prisma.club_subscriptions.update({
      where: { id },
      data: { member_id: memberId, customer_name: member.name, gender: member.gender },
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: id,
      action: 'member_transfer',
      branchId: sub.branch_id,
      before: { memberId: sub.member_id, customerName: sub.customer_name },
      after: { memberId, customerName: member.name },
    });

    return this.mapSub(row);
  }

  async statistics(isSpecial?: string, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [
      this.visibleMemberSubscriptionFilter(),
    ];
    const scope = this.branchScope.resolveListFilter(user, null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    const audience = this.audience(user);
    if (audience) and.push({ member: { is: { is_deleted: false, gender: audience } } });
    if (isSpecial === 'true' || isSpecial === '1') and.push(this.specialSubscriptionFilter());
    if (isSpecial === 'false' || isSpecial === '0') {
      and.push({
        AND: [
          { is_special: false },
          { OR: [{ subscription_type_id: null }, { type: { is_special_offer: false } }] },
        ],
      });
    }

    const where: Prisma.club_subscriptionsWhereInput = and.length ? { AND: and } : {};
    const rows = await this.prisma.club_subscriptions.findMany({ where });
    let total = 0;
    let active = 0;
    let expired = 0;
    let upcoming = 0;
    let totalValue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let monthlyCount = 0;
    let yearlyCount = 0;

    for (const r of rows) {
      total++;
      const st = deriveSubStatus(r.subscription_start_date, r.subscription_end_date);
      if (st === 'active') active++;
      else if (st === 'expired') expired++;
      else upcoming++;

      // A destination transfer subscription carries the moved entitlement value as a
      // non-cash credit. Only the uncovered value is a new contract value.
      totalValue += Math.max(
        0,
        toNum(r.subscription_value) - toNum(r.transferred_credit_amount),
      );
      totalPaid += toNum(r.paid_amount);
      totalRemaining += toNum(r.remaining_amount);

      const dur = daysBetween(r.subscription_start_date, r.subscription_end_date);
      if (dur <= 35) monthlyCount++;
      if (dur >= 360) yearlyCount++;
    }

    return { total, active, expired, upcoming, totalValue, totalPaid, totalRemaining, monthlyCount, yearlyCount };
  }

  async outstandingReport(query: {
    dateFrom?: string;
    dateTo?: string;
    branch?: string;
    search?: string;
    dateField?: string;
  }, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [
      this.visibleMemberSubscriptionFilter(),
      { remaining_amount: { gt: 0 } },
    ];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    const audience = this.audience(user);
    if (audience) and.push({ member: { is: { is_deleted: false, gender: audience } } });
    if (query.search?.trim()) {
      const s = query.search.trim();
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
        ],
      });
    }
    const dateField = query.dateField ?? 'registration_date';
    if (query.dateFrom && query.dateTo) {
      if (dateField === 'subscription_start_date') {
        and.push({ subscription_start_date: { gte: query.dateFrom, lte: query.dateTo } });
      } else if (dateField === 'subscription_end_date') {
        and.push({ subscription_end_date: { gte: query.dateFrom, lte: query.dateTo } });
      } else {
        and.push({ registration_date: { gte: query.dateFrom, lte: query.dateTo } });
      }
    }

    const rows = await this.prisma.club_subscriptions.findMany({
      where: { AND: and },
      orderBy: [{ remaining_amount: 'desc' }, { registration_date: 'desc' }],
    });

    const subscriptions = rows.map((r) => ({
      ...this.mapSub(r),
      netValue: netValue(toNum(r.subscription_value), r.discount_enabled, toNum(r.discount_value)),
    }));

    const memberIds = new Set(rows.map((r) => r.member_id).filter(Boolean));
    return {
      subscriptions,
      summary: {
        count: rows.length,
        uniqueMembers: memberIds.size,
        totalOutstanding: subscriptions.reduce((s, x) => s + x.remainingAmount, 0),
        totalPaid: subscriptions.reduce((s, x) => s + x.paidAmount, 0),
        totalNetValue: subscriptions.reduce((s, x) => s + x.netValue, 0),
      },
    };
  }

  async expiredReport(query: { branch?: string; search?: string }, user?: JwtUser) {
    const and: Prisma.club_subscriptionsWhereInput[] = [this.visibleMemberSubscriptionFilter()];
    if (query.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    const audience = this.audience(user);
    if (audience) and.push({ member: { is: { is_deleted: false, gender: audience } } });
    const rows = await this.prisma.club_subscriptions.findMany({
      where: and.length ? { AND: and } : {},
      orderBy: { subscription_end_date: 'desc' },
    });
    type SubRow = ReturnType<ClubSubscriptionsService['mapSub']>;
    let list: SubRow[] = rows
      .filter((r) => deriveSubStatus(r.subscription_start_date, r.subscription_end_date) === 'expired')
      .map((r) => this.mapSub(r));
    if (query.search?.trim()) {
      const s = query.search.trim().toLowerCase();
      list = list.filter(
        (x) =>
          String(x.customerName ?? '').toLowerCase().includes(s) ||
          String(x.subscriptionNumber).toLowerCase().includes(s),
      );
    }
    return { data: list, count: list.length };
  }

  async updateExpiredStatuses(): Promise<number> {
    const today = localDateString();
    const result = await this.prisma.club_subscriptions.updateMany({
      where: {
        status: { in: ['active', 'upcoming'] },
        subscription_end_date: { lt: today },
      },
      data: { status: 'expired' },
    });
    return result.count;
  }

  /**
   * Subscriptions whose first fully-expired day is today (before status update).
   * deriveSubStatus keeps subscription_end_date itself an active day, so "newly expired" means
   * the end date was YESTERDAY — selecting end date == today would fire a day early.
   */
  async findNewlyExpired() {
    const yesterday = addDays(localDateString(), -1);
    return this.prisma.club_subscriptions.findMany({
      where: {
        subscription_end_date: yesterday,
        status: { in: ['active', 'upcoming'] },
      },
      select: {
        id: true,
        member_id: true,
        branch_id: true,
        customer_name: true,
        subscription_number: true,
      },
    });
  }
}
