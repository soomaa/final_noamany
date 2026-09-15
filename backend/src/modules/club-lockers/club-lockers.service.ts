import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder, assertOverpayCap } from '../../common/validators';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { paginated } from '../../common/dto/list-result';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { lockerNetDue } from '../club-fitness/club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap } from '../club-members/club-member-brief.utils';
import { ClubLockerAccountingService } from './club-locker-accounting.service';
import { ListClubLockerSubscriptionsDto } from './dto/list-club-locker-subscriptions.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

const STATUS_MAP: Record<string, string> = {
  نشط: 'active',
  منتهي: 'expired',
  قادم: 'upcoming',
  active: 'active',
  expired: 'expired',
  upcoming: 'upcoming',
};

@Injectable()
export class ClubLockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: ClubLockerAccountingService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async listLockers(query: {
    mainBranchId?: string;
    subBranchId?: string;
    lockerNumber?: string;
    isAvailable?: string;
  }) {
    const where: Prisma.club_lockersWhereInput = {};
    if (query.mainBranchId) where.main_branch_id = Number(query.mainBranchId);
    if (query.subBranchId) where.sub_branch_id = Number(query.subBranchId);
    if (query.lockerNumber) where.locker_number = { contains: query.lockerNumber };
    if (query.isAvailable === 'true') where.is_available = true;
    if (query.isAvailable === 'false') where.is_available = false;
    return this.prisma.club_lockers.findMany({ where, orderBy: { locker_number: 'asc' } });
  }

  private mapSubDetail(
    row: {
      id: number;
      subscription_number: string;
      main_branch_id: number;
      sub_branch_id: number;
      member_id: number | null;
      customer_name: string;
      subscription_type_id: number;
      subscription_days: number | null;
      subscription_start_date: string;
      subscription_end_date: string;
      subscription_value: Prisma.Decimal;
      discount_enabled: boolean;
      discount_value: Prisma.Decimal;
      paid_amount: Prisma.Decimal;
      locker_id: number;
      payment_method: string | null;
      gender: string | null;
      recommended_employee_id: number | null;
      receipt_number: string | null;
      status: string;
      created_by: number | null;
      created_at: Date;
      type?: { name: string } | null;
      member?: { member_code: string; name: string; phone: string | null; profile_picture: string | null } | null;
    },
    userNameById: Map<number, string | null>,
    empNameById: Map<number, string | null>,
  ) {
    const base = this.mapSub(row);
    return {
      ...base,
      subscriptionTypeName: row.type?.name ?? null,
      memberCode: row.member?.member_code ?? null,
      memberName: row.member?.name ?? null,
      memberPhone: row.member?.phone ?? null,
      memberProfilePicture: row.member?.profile_picture ?? null,
      bookedByName: row.created_by != null ? userNameById.get(row.created_by) ?? null : null,
      recommendedEmployeeName:
        row.recommended_employee_id != null
          ? empNameById.get(row.recommended_employee_id) ?? null
          : null,
    };
  }

  async getLockerDetails(id: number) {
    const locker = await this.prisma.club_lockers.findUnique({ where: { id } });
    if (!locker) throw new NotFoundException('اللوكر غير موجود');

    const subs = await this.prisma.club_locker_subscriptions.findMany({
      where: { locker_id: id },
      orderBy: { created_at: 'desc' },
      include: {
        type: { select: { name: true } },
        member: { select: { member_code: true, name: true, phone: true, profile_picture: true } },
      },
    });

    const userIds = [...new Set(subs.map((s) => s.created_by).filter((uid): uid is number => uid != null))];
    const empIds = [
      ...new Set(subs.map((s) => s.recommended_employee_id).filter((eid): eid is number => eid != null)),
    ];
    const [users, emps] = await Promise.all([
      userIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, name: true },
          })
        : [],
      empIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: empIds } },
            select: { id: true, employee: true },
          })
        : [],
    ]);
    const userNameById = new Map<number, string | null>(
      users.map((u) => [u.user_id, u.name ?? null] as const),
    );
    const empNameById = new Map<number, string | null>(
      emps.map((e) => [e.id, e.employee ?? null] as const),
    );

    const history = subs.map((s) => this.mapSubDetail(s, userNameById, empNameById));
    const currentSubscription =
      history.find((s) => s.status === 'active' || s.status === 'upcoming') ?? null;

    return {
      id: locker.id,
      lockerNumber: locker.locker_number,
      mainBranchId: locker.main_branch_id,
      subBranchId: locker.sub_branch_id,
      isAvailable: locker.is_available,
      totalBookings: history.length,
      currentSubscription,
      lastBooking: history[0] ?? null,
      history,
    };
  }

  async createLocker(body: { lockerNumber: string; mainBranchId: number; subBranchId: number }) {
    return this.prisma.club_lockers.create({
      data: {
        locker_number: body.lockerNumber,
        main_branch_id: body.mainBranchId,
        sub_branch_id: body.subBranchId,
      },
    });
  }

  async updateLocker(id: number, body: Partial<{ lockerNumber: string; mainBranchId: number; subBranchId: number; isAvailable: boolean }>) {
    return this.prisma.club_lockers.update({
      where: { id },
      data: {
        ...(body.lockerNumber != null ? { locker_number: body.lockerNumber } : {}),
        ...(body.mainBranchId != null ? { main_branch_id: body.mainBranchId } : {}),
        ...(body.subBranchId != null ? { sub_branch_id: body.subBranchId } : {}),
        ...(body.isAvailable !== undefined ? { is_available: body.isAvailable } : {}),
      },
    });
  }

  async removeLocker(id: number) {
    const subs = await this.prisma.club_locker_subscriptions.findMany({ where: { locker_id: id } });
    const today = localDateString();
    const hasActive = subs.some((s) => {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      return st === 'active' || st === 'upcoming';
    });
    if (hasActive) throw new BadRequestException('لا يمكن حذف اللوكر — يوجد اشتراك نشط');
    await this.prisma.club_lockers.delete({ where: { id } });
    return { success: true };
  }

  async lockerStatistics() {
    const [lockers, subs] = await Promise.all([
      this.prisma.club_lockers.findMany(),
      this.prisma.club_locker_subscriptions.findMany(),
    ]);
    let activeSubscriptions = 0;
    let expiredSubscriptions = 0;
    for (const s of subs) {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st === 'active') activeSubscriptions++;
      else if (st === 'expired') expiredSubscriptions++;
      // 'upcoming' is intentionally counted in neither bucket.
    }
    return {
      total: lockers.length,
      available: lockers.filter((l) => l.is_available).length,
      unavailable: lockers.filter((l) => !l.is_available).length,
      activeSubscriptions,
      expiredSubscriptions,
    };
  }

  async listTypes() {
    return this.prisma.club_locker_subscription_types.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  async createType(body: Record<string, unknown>) {
    return this.prisma.club_locker_subscription_types.create({
      data: {
        name: String(body.name),
        meta_value: Number(body.metaValue),
        mta_value: Number(body.mtaValue ?? body.metaValue),
        days: Number(body.days),
        has_stop: Boolean(body.hasStop),
        stop_days: body.stopDays != null ? Number(body.stopDays) : null,
        is_target_based: Boolean(body.isTargetBased),
        is_active: body.isActive !== false,
      },
    });
  }

  async updateType(id: number, body: Record<string, unknown>) {
    return this.prisma.club_locker_subscription_types.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name) } : {}),
        ...(body.metaValue != null ? { meta_value: Number(body.metaValue) } : {}),
        ...(body.mtaValue != null ? { mta_value: Number(body.mtaValue) } : {}),
        ...(body.days != null ? { days: Number(body.days) } : {}),
        ...(body.hasStop !== undefined ? { has_stop: Boolean(body.hasStop) } : {}),
        ...(body.stopDays !== undefined ? { stop_days: body.stopDays != null ? Number(body.stopDays) : null } : {}),
        ...(body.isTargetBased !== undefined ? { is_target_based: Boolean(body.isTargetBased) } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
  }

  async removeType(id: number) {
    await this.prisma.club_locker_subscription_types.delete({ where: { id } });
    return { success: true };
  }

  private mapSub(row: Record<string, unknown>) {
    const start = row.subscription_start_date as string;
    const end = row.subscription_end_date as string;
    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      mainBranchId: row.main_branch_id,
      subBranchId: row.sub_branch_id,
      memberId: row.member_id,
      customerName: row.customer_name,
      subscriptionTypeId: row.subscription_type_id,
      subscriptionDays: row.subscription_days,
      subscriptionStartDate: start,
      subscriptionEndDate: end,
      subscriptionValue: toNum(row.subscription_value),
      discountEnabled: row.discount_enabled,
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      lockerId: row.locker_id,
      paymentMethod: row.payment_method,
      gender: row.gender,
      recommendedEmployeeId: row.recommended_employee_id,
      receiptNumber: row.receipt_number,
      status: deriveSubStatus(start, end),
      createdAt: row.created_at,
    };
  }

  async listSubscriptions(q: ListClubLockerSubscriptionsDto, user?: JwtUser) {
    const and: Prisma.club_locker_subscriptionsWhereInput[] = [];
    if (q.gender && q.gender !== 'male' && q.gender !== 'female') {
      throw new BadRequestException('القسم غير صحيح');
    }
    const lockedAudience = this.branchScope.memberGenderFilter(user);
    if (lockedAudience && q.gender && q.gender !== lockedAudience) {
      throw new BadRequestException('لا يمكن تغيير قسم البيانات المسموح به');
    }
    const audience = lockedAudience ?? (q.gender as 'male' | 'female' | undefined);
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { customer_name: { contains: s } },
          { subscription_number: { contains: s } },
          { receipt_number: { contains: s } },
        ],
      });
    }
    if (q.mainBranchId) and.push({ main_branch_id: Number(q.mainBranchId) });
    if (q.subBranchId) and.push({ sub_branch_id: Number(q.subBranchId) });
    // Default a branch-scoped user to their allowed branches (locker branch = main_branch_id).
    const scope = this.branchScope.resolveListFilter(user, q.mainBranchId ?? null);
    if (scope !== null) and.push({ main_branch_id: { in: scope } });
    if (audience) and.push({ member: { is_deleted: false, gender: audience } });
    if (q.startDate) and.push({ subscription_end_date: { gte: q.startDate } });
    if (q.endDate) and.push({ subscription_start_date: { lte: q.endDate } });

    // Translate the status filter into a date-range predicate so it runs in the DB BEFORE pagination
    // — applying it in-memory to an already-paginated page corrupts both the page and the total.
    if (q.status && q.status !== 'all') {
      const mapped = STATUS_MAP[q.status] ?? q.status;
      const today = localDateString();
      if (mapped === 'upcoming') and.push({ subscription_start_date: { gt: today } });
      else if (mapped === 'expired') and.push({ subscription_end_date: { lt: today } });
      else if (mapped === 'active')
        and.push({ subscription_start_date: { lte: today }, subscription_end_date: { gte: today } });
    }

    const where: Prisma.club_locker_subscriptionsWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.club_locker_subscriptions.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: q.skip,
        take: q.take,
        include: { locker: true, type: true },
      }),
      this.prisma.club_locker_subscriptions.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({ ...this.mapSub(r), ...attachMemberBrief(r.member_id as number | null, memberMap) })),
      total,
      q.page,
      q.pageSize,
    );
  }

  private async generateLockNumber(tx: Prisma.TransactionClient): Promise<string> {
    // Serialize concurrent creates on a named advisory lock so two transactions can't read the same
    // MAX and mint the same LOCK###### (the unique constraint would otherwise 500 the loser).
    await tx.$queryRaw`SELECT GET_LOCK('club_locker_sub_number', 10)`;
    try {
      const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
        SELECT MAX(CAST(SUBSTRING(subscription_number, 5) AS UNSIGNED)) AS maxNum
        FROM club_locker_subscriptions WHERE subscription_number LIKE 'LOCK%'
      `;
      const next = (rows[0]?.maxNum ?? 0) + 1;
      return `LOCK${String(next).padStart(6, '0')}`;
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK('club_locker_sub_number')`;
    }
  }

  /**
   * Free a locker ONLY when no other subscription still occupies it (active or upcoming).
   * Prevents the availability drift / double-booking the migration spec said to fix: blindly
   * setting is_available=true on every release ignores siblings on the same locker.
   */
  private async freeLockerIfUnoccupied(
    lockerId: number,
    excludeSubId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const db = tx ?? this.prisma;
    const others = await db.club_locker_subscriptions.findMany({
      where: { locker_id: lockerId, id: { not: excludeSubId } },
      select: { subscription_start_date: true, subscription_end_date: true },
    });
    const stillOccupied = others.some((o) => {
      const st = deriveSubStatus(o.subscription_start_date, o.subscription_end_date);
      return st === 'active' || st === 'upcoming';
    });
    if (stillOccupied) return false;
    await db.club_lockers.update({ where: { id: lockerId }, data: { is_available: true } });
    return true;
  }

  async createSubscription(body: Record<string, unknown>, userId: number) {
    const lockerId = Number(body.lockerId);
    const typeId = Number(body.subscriptionTypeId);
    const type = await this.prisma.club_locker_subscription_types.findUnique({ where: { id: typeId } });
    if (!type) throw new BadRequestException('نوع اشتراك اللوكر غير موجود');

    const subscriptionValue = toNum(type.meta_value);
    const discountEnabled = Boolean(body.discountEnabled);
    const discountValue = Number(body.discountValue ?? 0);
    const netDue = lockerNetDue(subscriptionValue, discountEnabled, discountValue);
    const paidAmount = Number(body.paidAmount ?? 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new BadRequestException('المبلغ المدفوع غير صالح');
    }
    assertOverpayCap(paidAmount, netDue, 'المبلغ المدفوع أكبر من المستحق بعد الخصم');

    const start = String(body.subscriptionStartDate ?? localDateString());
    const end = body.subscriptionEndDate ? String(body.subscriptionEndDate) : addDays(start, type.days);
    assertDateOrder(start, end);

    return this.prisma.$transaction(async (tx) => {
      const locker = await tx.club_lockers.findUnique({ where: { id: lockerId } });
      if (!locker) throw new NotFoundException('اللوكر غير موجود');
      if (!locker.is_available) throw new BadRequestException('اللوكر غير متاح للحجز');

      const subNumber = await this.generateLockNumber(tx);

      // If the caller supplied a paid amount, record a receipt + balanced GL entry so locker cash
      // is visible to accounting. Otherwise fall back to any client-supplied receipt number.
      const paymentMethod = body.paymentMethod != null ? String(body.paymentMethod) : null;
      const receiptNumber =
        paidAmount > 0
          ? await this.accounting.recordPayment(tx, {
              amount: paidAmount,
              memberName: String(body.customerName),
              memberId: body.memberId != null ? Number(body.memberId) : null,
              branchId: Number(body.mainBranchId),
              paymentMethod,
              registrationDate: start,
              createdBy: userId,
              subscriptionNumber: subNumber,
            })
          : body.receiptNumber
            ? String(body.receiptNumber)
            : null;

      const row = await tx.club_locker_subscriptions.create({
        data: {
          subscription_number: subNumber,
          main_branch_id: Number(body.mainBranchId),
          sub_branch_id: Number(body.subBranchId),
          member_id: body.memberId != null ? Number(body.memberId) : null,
          customer_name: String(body.customerName),
          subscription_type_id: typeId,
          subscription_days: type.days,
          subscription_start_date: start,
          subscription_end_date: end,
          subscription_value: subscriptionValue,
          discount_enabled: discountEnabled,
          discount_value: discountValue,
          paid_amount: paidAmount,
          locker_id: lockerId,
          payment_method: body.paymentMethod as 'cash' | 'card' | 'bank' | 'online' | undefined,
          gender: body.gender as 'male' | 'female' | undefined,
          recommended_employee_id: body.recommendedEmployeeId != null ? Number(body.recommendedEmployeeId) : null,
          receipt_number: receiptNumber,
          status: deriveSubStatus(start, end),
          created_by: userId,
        },
      });

      await tx.club_lockers.update({ where: { id: lockerId }, data: { is_available: false } });
      return this.mapSub(row);
    });
  }

  async updateSubscription(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('اشتراك اللوكر غير موجود');
    const start = body.subscriptionStartDate ? String(body.subscriptionStartDate) : existing.subscription_start_date;
    const end = body.subscriptionEndDate ? String(body.subscriptionEndDate) : existing.subscription_end_date;
    assertDateOrder(start, end);
    const newStatus = deriveSubStatus(start, end);
    const oldStatus = deriveSubStatus(existing.subscription_start_date, existing.subscription_end_date);

    // A change to paid_amount must go through a receipt + GL, not a silent column write.
    // Only an INCREASE (an additional payment) is allowed here; a decrease requires a refund flow.
    let paymentDelta = 0;
    if (body.paidAmount != null) {
      const newPaid = Number(body.paidAmount);
      if (!Number.isFinite(newPaid) || newPaid < 0) throw new BadRequestException('المبلغ المدفوع غير صالح');
      const netDue = lockerNetDue(
        toNum(existing.subscription_value),
        existing.discount_enabled,
        toNum(existing.discount_value),
      );
      assertOverpayCap(newPaid, netDue, 'المبلغ المدفوع أكبر من المستحق بعد الخصم');
      paymentDelta = Math.round((newPaid - toNum(existing.paid_amount)) * 100) / 100;
      if (paymentDelta < 0) {
        throw new BadRequestException('لا يمكن تخفيض المبلغ المدفوع من هنا، استخدم الاسترداد');
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (paymentDelta > 0) {
        await this.accounting.recordPayment(tx, {
          amount: paymentDelta,
          memberName: String(body.customerName ?? existing.customer_name),
          memberId: existing.member_id,
          branchId: existing.main_branch_id,
          paymentMethod: body.paymentMethod != null ? String(body.paymentMethod) : existing.payment_method,
          createdBy: existing.created_by ?? undefined,
          subscriptionNumber: existing.subscription_number,
        });
      }
      const updated = await tx.club_locker_subscriptions.update({
        where: { id },
        data: {
          ...(body.customerName != null ? { customer_name: String(body.customerName) } : {}),
          ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
          ...(body.subscriptionStartDate != null ? { subscription_start_date: start } : {}),
          ...(body.subscriptionEndDate != null ? { subscription_end_date: end } : {}),
          ...(body.paidAmount != null ? { paid_amount: Number(body.paidAmount) } : {}),
          status: newStatus,
        },
      });
      // Reconcile the locker when an edit changes occupancy (e.g. end-date moved to the past expires it).
      if (newStatus === 'expired' && oldStatus !== 'expired') {
        await this.freeLockerIfUnoccupied(existing.locker_id, id, tx);
      } else if (newStatus !== 'expired' && oldStatus === 'expired') {
        await tx.club_lockers.update({ where: { id: existing.locker_id }, data: { is_available: false } });
      }
      return updated;
    });
    return this.mapSub(row);
  }

  async removeSubscription(id: number) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    await this.prisma.club_locker_subscriptions.delete({ where: { id } });
    await this.freeLockerIfUnoccupied(sub.locker_id, id);
    return { success: true };
  }

  async releaseSubscription(id: number) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    await this.prisma.club_locker_subscriptions.update({
      where: { id },
      data: { status: 'expired', subscription_end_date: localDateString() },
    });
    await this.freeLockerIfUnoccupied(sub.locker_id, id);
    return { success: true };
  }

  async expireAndReleaseLockers(): Promise<{ subs: number; lockers: number }> {
    const today = localDateString();
    const subs = await this.prisma.club_locker_subscriptions.findMany({
      where: { subscription_end_date: { lt: today }, status: { not: 'expired' } },
    });
    let lockerCount = 0;
    for (const s of subs) {
      await this.prisma.club_locker_subscriptions.update({ where: { id: s.id }, data: { status: 'expired' } });
      // Only free the locker if no other (active/upcoming) subscription still holds it.
      if (await this.freeLockerIfUnoccupied(s.locker_id, s.id)) lockerCount++;
    }
    return { subs: subs.length, lockers: lockerCount };
  }

  async freezeSubscription(id: number, days: number, dryRun?: boolean) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    if (!sub.type.has_stop) throw new BadRequestException('نوع اشتراك اللوكر لا يدعم التجميد');
    if (sub.status !== 'active') throw new BadRequestException('يمكن تجميد الاشتراك النشط فقط');
    if (!Number.isFinite(days) || days <= 0) throw new BadRequestException('عدد أيام التجميد غير صالح');
    if (sub.type.stop_days != null && days > sub.type.stop_days) {
      throw new BadRequestException(`عدد أيام التجميد يتجاوز السقف (${sub.type.stop_days})`);
    }

    const previewRows: PreviewRow[] = [
      { label: 'الحالة', before: sub.status, after: 'frozen' },
      { label: 'أيام التجميد', after: String(days) },
      { label: 'تاريخ النهاية', before: sub.subscription_end_date, after: addDays(sub.subscription_end_date, days) },
    ];
    if (isDryRun(dryRun)) {
      return previewResponse({ subscriptionId: id, days }, { rows: previewRows });
    }

    const row = await this.prisma.club_locker_subscriptions.update({
      where: { id },
      data: {
        status: 'frozen',
        freeze_start_date: localDateString(),
        subscription_end_date: addDays(sub.subscription_end_date, days),
      },
    });
    return this.mapSub(row);
  }

  async unfreezeSubscription(id: number, dryRun?: boolean) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    if (sub.status !== 'frozen') throw new BadRequestException('الاشتراك غير مجمد');

    const newStatus = deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date);
    const previewRows: PreviewRow[] = [
      { label: 'الحالة', before: 'frozen', after: newStatus },
      { label: 'تاريخ النهاية', after: sub.subscription_end_date },
    ];
    if (isDryRun(dryRun)) {
      return previewResponse({ subscriptionId: id }, { rows: previewRows });
    }

    const row = await this.prisma.club_locker_subscriptions.update({
      where: { id },
      data: { status: newStatus, freeze_start_date: null },
    });
    return this.mapSub(row);
  }
}
