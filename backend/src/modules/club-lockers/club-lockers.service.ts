import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder, assertOverpayCap } from '../../common/validators';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { paginated } from '../../common/dto/list-result';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSubStatus, nextSeqFromMax, resolveSubscriptionEndDate, toNum } from '../club-subscriptions/club-subscription.utils';
import { retryOnUniqueViolation } from '../../common/retry-unique';
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
  frozen: 'frozen',
  مجمد: 'frozen',
};

@Injectable()
export class ClubLockersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: ClubLockerAccountingService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private async lockersAreSplit(): Promise<boolean> {
    const table = this.prisma.club_gym_policies;
    if (!table?.findUnique) return false;
    const row = await table.findUnique({
      where: { id: 1 },
      select: { split_lockers_by_gender: true },
    });
    return row?.split_lockers_by_gender === true;
  }

  async getLockerSplit() {
    return { splitByGender: await this.lockersAreSplit() };
  }

  async setLockerSplit(enabled: boolean) {
    await this.prisma.club_gym_policies.upsert({
      where: { id: 1 },
      update: { split_lockers_by_gender: enabled },
      create: { id: 1, split_lockers_by_gender: enabled },
    });
    return { splitByGender: enabled };
  }

  private lockerSection(value: unknown): 'male' | 'female' | 'shared' {
    return value === 'male' || value === 'female' ? value : 'shared';
  }

  async listLockers(query: {
    mainBranchId?: string;
    subBranchId?: string;
    lockerNumber?: string;
    isAvailable?: string;
  }, user?: JwtUser) {
    const where: Prisma.club_lockersWhereInput = {};
    if (query.mainBranchId) where.main_branch_id = Number(query.mainBranchId);
    if (query.subBranchId) where.sub_branch_id = Number(query.subBranchId);
    if (query.lockerNumber) where.locker_number = { contains: query.lockerNumber };
    if (query.isAvailable === 'true') where.is_available = true;
    if (query.isAvailable === 'false') where.is_available = false;
    const scope = this.branchScope.resolveListFilter(user, query.mainBranchId ?? null);
    if (scope !== null) where.main_branch_id = { in: scope };
    const rows = await this.prisma.club_lockers.findMany({ where });
    rows.sort((a, b) => a.locker_number.localeCompare(b.locker_number, 'en', { numeric: true, sensitivity: 'base' }));
    return this.attachCurrentHolders(rows);
  }

  private async attachCurrentHolders<T extends { id: number }>(rows: T[]) {
    if (rows.length === 0) return rows.map((row) => ({ ...row, current_holder: null }));
    const ids = rows.map((row) => row.id);
    const [handoffs, subs] = await Promise.all([
      this.prisma.club_locker_handoffs.findMany({
        where: { locker_id: { in: ids }, released_at: null },
        include: { member: { select: { name: true, member_code: true } } },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: { locker_id: { in: ids }, subscription_end_date: { gte: localDateString() } },
        include: { member: { select: { name: true, member_code: true } } },
      }),
    ]);
    const handoffByLocker = new Map(handoffs.map((row) => [row.locker_id, row]));
    const subByLocker = new Map<number, { sub: (typeof subs)[number]; active: boolean }>();
    for (const sub of subs) {
      const status = deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date);
      if (status !== 'active' && status !== 'upcoming') continue;
      const active = status === 'active';
      const best = subByLocker.get(sub.locker_id);
      if (!best || (active && !best.active)) subByLocker.set(sub.locker_id, { sub, active });
    }
    return rows.map((locker) => {
      const handoff = handoffByLocker.get(locker.id);
      if (handoff) {
        return {
          ...locker,
          current_holder: {
            member_id: handoff.member_id,
            member_name: handoff.member.name,
            member_code: handoff.member.member_code,
            since: handoff.assigned_at.toISOString(),
            source: 'handoff' as const,
          },
        };
      }
      const occupying = subByLocker.get(locker.id)?.sub;
      return {
        ...locker,
        current_holder: occupying
          ? {
              member_id: occupying.member_id,
              member_name: occupying.member?.name ?? occupying.customer_name,
              member_code: occupying.member?.member_code ?? null,
              since: occupying.subscription_start_date,
              source: 'subscription' as const,
            }
          : null,
      };
    });
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

  async getLockerDetails(id: number, user?: JwtUser) {
    const locker = await this.prisma.club_lockers.findUnique({ where: { id } });
    if (!locker) throw new NotFoundException('اللوكر غير موجود');
    this.assertBranchAccess(user, locker.main_branch_id);

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

    const handoffRows = await this.prisma.club_locker_handoffs.findMany({
      where: { locker_id: id },
      orderBy: { assigned_at: 'desc' },
      take: 50,
      include: { member: { select: { name: true, member_code: true } } },
    });
    const handoffs = handoffRows.map((row) => ({
      id: row.id,
      memberId: row.member_id,
      memberName: row.member.name,
      memberCode: row.member.member_code,
      assignedAt: row.assigned_at.toISOString(),
      releasedAt: row.released_at ? row.released_at.toISOString() : null,
    }));

    return {
      id: locker.id,
      lockerNumber: locker.locker_number,
      mainBranchId: locker.main_branch_id,
      subBranchId: locker.sub_branch_id,
      isAvailable: locker.is_available,
      section: this.lockerSection(locker.section),
      totalBookings: history.length,
      currentSubscription,
      lastBooking: history[0] ?? null,
      history,
      currentHandoff: handoffs.find((row) => row.releasedAt == null) ?? null,
      handoffs,
    };
  }

  /** Members still holding a locker key, plus lockers the desk can switch them to. */
  async listOpenHandoffs(branchId: number | string | null | undefined, user?: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    const rows = await this.prisma.club_locker_handoffs.findMany({
      where: {
        released_at: null,
        ...(scope !== null ? { branch_id: { in: scope } } : {}),
      },
      include: {
        member: { select: { id: true, name: true, member_code: true, gender: true } },
        locker: { select: { id: true, locker_number: true, main_branch_id: true, section: true } },
      },
      orderBy: { assigned_at: 'desc' },
    });
    const available = await this.prisma.club_lockers.findMany({
      where: {
        is_available: true,
        ...(scope !== null ? { main_branch_id: { in: scope } } : {}),
      },
    });
    available.sort((a, b) => a.locker_number.localeCompare(b.locker_number, 'en', { numeric: true, sensitivity: 'base' }));
    return {
      splitByGender: await this.lockersAreSplit(),
      holding: rows.map((row) => ({
        handoffId: row.id,
        memberId: row.member.id,
        memberName: row.member.name,
        memberCode: row.member.member_code,
        memberGender: row.member.gender === 'male' || row.member.gender === 'female' ? row.member.gender : null,
        lockerId: row.locker.id,
        lockerNumber: row.locker.locker_number,
        lockerSection: this.lockerSection(row.locker.section),
        branchId: row.branch_id,
        assignedAt: row.assigned_at.toISOString(),
      })),
      availableLockers: available.map((locker) => ({
        id: locker.id,
        lockerNumber: locker.locker_number,
        branchId: locker.main_branch_id,
        section: this.lockerSection(locker.section),
      })),
    };
  }

  /** Lockers the desk can hand to this member, plus the one they already hold. */
  async deskOptions(memberId: number, user?: JwtUser) {
    if (!Number.isInteger(memberId) || memberId <= 0) throw new BadRequestException('اختار عضو');
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { id: true, branch_id: true, is_deleted: true, gender: true },
    });
    if (!member || member.is_deleted) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, member.branch_id);

    const current = await this.prisma.club_locker_handoffs.findFirst({
      where: { member_id: member.id, released_at: null },
      include: { locker: { select: { id: true, locker_number: true, main_branch_id: true } } },
    });
    const lockers = await this.prisma.club_lockers.findMany({
      where: {
        main_branch_id: member.branch_id,
        OR: [
          { is_available: true },
          ...(current ? [{ id: current.locker_id }] : []),
        ],
      },
    });
    lockers.sort((a, b) => a.locker_number.localeCompare(b.locker_number, 'en', { numeric: true, sensitivity: 'base' }));
    const split = await this.lockersAreSplit();
    const gender = member.gender === 'male' || member.gender === 'female' ? member.gender : null;
    const visible = lockers.filter((locker) => {
      if (current && locker.id === current.locker_id) return true;
      if (!split) return true;
      const section = this.lockerSection(locker.section);
      if (section === 'shared' || !gender) return true;
      return section === gender;
    });
    return {
      splitByGender: split,
      section: split ? gender : null,
      lockers: visible.map((locker) => ({
        id: locker.id,
        lockerNumber: locker.locker_number,
        available: locker.is_available,
        section: this.lockerSection(locker.section),
      })),
      current: current
        ? {
            handoffId: current.id,
            lockerId: current.locker_id,
            lockerNumber: current.locker.locker_number,
            assignedAt: current.assigned_at.toISOString(),
          }
        : null,
    };
  }

  async assignHandoff(body: { lockerId: number; memberId: number }, user: JwtUser) {
    const lockerId = Number(body.lockerId);
    const memberId = Number(body.memberId);
    if (!Number.isInteger(lockerId) || lockerId <= 0 || !Number.isInteger(memberId) || memberId <= 0) {
      throw new BadRequestException('اختار لوكر وعضو');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const locker = await tx.club_lockers.findUnique({ where: { id: lockerId } });
      if (!locker) throw new NotFoundException('اللوكر غير موجود');
      this.assertBranchAccess(user, locker.main_branch_id);

      const member = await tx.club_members.findUnique({
        where: { id: memberId },
        select: { id: true, name: true, member_code: true, branch_id: true, is_deleted: true, is_blocked: true, gender: true },
      });
      if (!member || member.is_deleted) throw new NotFoundException('العضو غير موجود');
      if (member.is_blocked) throw new BadRequestException('العضو محظور، مش هينفع يستلم لوكر');
      if (member.branch_id !== locker.main_branch_id) {
        throw new BadRequestException('اللوكر مش في فرع العضو');
      }
      if (await this.lockersAreSplit()) {
        const section = this.lockerSection(locker.section);
        if (section === 'male' || section === 'female') {
          if (member.gender !== 'male' && member.gender !== 'female') {
            throw new BadRequestException('حدد نوع العضو قبل تسليم اللوكر');
          }
          if (member.gender !== section) {
            throw new BadRequestException(member.gender === 'female' ? 'البنت بتاخد لوكر حريمي' : 'الولد بياخد لوكر رجالي');
          }
        }
      }

      const openOnLocker = await tx.club_locker_handoffs.findFirst({
        where: { locker_id: locker.id, released_at: null },
      });
      if (openOnLocker?.member_id === member.id) {
        return {
          handoffId: openOnLocker.id,
          lockerId: locker.id,
          lockerNumber: locker.locker_number,
          memberId: member.id,
          memberName: member.name,
          assignedAt: openOnLocker.assigned_at.toISOString(),
        };
      }
      if (openOnLocker) throw new BadRequestException('اللوكر ده مع عضو تاني دلوقتي');

      const previous = await tx.club_locker_handoffs.findMany({
        where: { member_id: member.id, released_at: null },
      });
      for (const row of previous) {
        await tx.club_locker_handoffs.update({
          where: { id: row.id },
          data: { released_at: new Date(), released_by: user.sub },
        });
        await this.freeLockerIfUnoccupied(row.locker_id, 0, tx);
      }

      const claimed = await tx.club_lockers.updateMany({
        where: { id: locker.id, is_available: true },
        data: { is_available: false },
      });
      if (claimed.count !== 1) throw new BadRequestException('اللوكر مش فاضي');

      const created = await tx.club_locker_handoffs.create({
        data: {
          locker_id: locker.id,
          member_id: member.id,
          branch_id: locker.main_branch_id,
          assigned_by: user.sub,
        },
      });
      return {
        handoffId: created.id,
        lockerId: locker.id,
        lockerNumber: locker.locker_number,
        memberId: member.id,
        memberName: member.name,
        assignedAt: created.assigned_at.toISOString(),
      };
    });
  }

  async releaseHandoff(memberId: number, user: JwtUser) {
    if (!Number.isInteger(memberId) || memberId <= 0) throw new BadRequestException('العضو غير موجود');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const open = await tx.club_locker_handoffs.findMany({
        where: { member_id: memberId, released_at: null },
        orderBy: { assigned_at: 'desc' },
        include: { locker: { select: { locker_number: true, main_branch_id: true } } },
      });
      if (open.length === 0) return { released: false, lockerNumber: null as string | null };
      for (const row of open) this.assertBranchAccess(user, row.locker.main_branch_id);
      await tx.club_locker_handoffs.updateMany({
        where: { id: { in: open.map((row) => row.id) } },
        data: { released_at: new Date(), released_by: user.sub },
      });
      for (const row of open) await this.freeLockerIfUnoccupied(row.locker_id, 0, tx);
      return { released: true, lockerId: open[0].locker_id, lockerNumber: open[0].locker.locker_number };
    });
  }

  /** Checkout and the nightly sweep return a visit locker without a desk user. */
  async releaseOpenForMember(memberId: number, releasedBy?: number | null) {
    if (!Number.isInteger(memberId) || memberId <= 0) return null;
    return this.prisma.$transaction(async (tx) => {
      // Serialize checkout/auto-close with desk assignment or switching. Without
      // the member lock, a concurrent handoff could be created between this read
      // and update and get returned immediately by the checkout request.
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const open = await tx.club_locker_handoffs.findMany({
        where: { member_id: memberId, released_at: null },
        orderBy: { assigned_at: 'desc' },
        include: { locker: { select: { locker_number: true } } },
      });
      if (open.length === 0) return null;
      await tx.club_locker_handoffs.updateMany({
        where: { id: { in: open.map((row) => row.id) } },
        data: { released_at: new Date(), released_by: releasedBy ?? null },
      });
      for (const row of open) await this.freeLockerIfUnoccupied(row.locker_id, 0, tx);
      return { lockerId: open[0].locker_id, lockerNumber: open[0].locker.locker_number };
    });
  }

  async openHandoffNumbers(memberIds: number[]) {
    const ids = [...new Set(memberIds.filter((id) => Number.isInteger(id) && id > 0))];
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.club_locker_handoffs.findMany({
      where: { member_id: { in: ids }, released_at: null },
      include: { locker: { select: { locker_number: true } } },
    });
    for (const row of rows) map.set(row.member_id, row.locker.locker_number);
    return map;
  }

  /** Visit handoffs are same-day: release any still open from before today. */
  async releaseStaleHandoffs(): Promise<number> {
    const today = localDateString();
    const open = await this.prisma.club_locker_handoffs.findMany({
      where: { released_at: null },
      select: { id: true, locker_id: true, assigned_at: true },
    });
    const stale = open.filter((row) => localDateString(row.assigned_at) < today);
    if (stale.length === 0) return 0;
    await this.prisma.club_locker_handoffs.updateMany({
      where: { id: { in: stale.map((row) => row.id) }, released_at: null },
      data: { released_at: new Date() },
    });
    for (const lockerId of new Set(stale.map((row) => row.locker_id))) {
      await this.freeLockerIfUnoccupied(lockerId, 0);
    }
    return stale.length;
  }

  async createLocker(
    body: { lockerNumber: string; mainBranchId: number; subBranchId: number; section?: string },
    user?: JwtUser,
  ) {
    this.assertBranchAccess(user, body.mainBranchId);
    const number = String(body.lockerNumber ?? '').trim();
    if (!number) throw new BadRequestException('اكتب رقم اللوكر');
    const section = this.lockerSection(body.section);
    const duplicate = await this.prisma.club_lockers.findFirst({
      where: { locker_number: number, main_branch_id: body.mainBranchId, section },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        section === 'male'
          ? 'الرقم ده موجود عند الرجالي'
          : section === 'female'
            ? 'الرقم ده موجود عند الحريمي'
            : 'الرقم ده موجود',
      );
    }
    return this.prisma.club_lockers.create({
      data: {
        locker_number: number,
        main_branch_id: body.mainBranchId,
        sub_branch_id: body.subBranchId || body.mainBranchId,
        section,
      },
    });
  }

  async updateLocker(
    id: number,
    body: Partial<{ lockerNumber: string; mainBranchId: number; subBranchId: number; isAvailable: boolean }>,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.club_lockers.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('اللوكر غير موجود');
    this.assertBranchAccess(user, existing.main_branch_id);
    if (body.mainBranchId != null) this.assertBranchAccess(user, body.mainBranchId);
    if (body.isAvailable === true || (body.mainBranchId != null && body.mainBranchId !== existing.main_branch_id)) {
      const openHandoff = await this.prisma.club_locker_handoffs.findFirst({
        where: { locker_id: id, released_at: null },
        select: { id: true },
      });
      if (openHandoff) throw new BadRequestException('اللوكر مع عضو دلوقتي — رجّعه الأول');
    }
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

  async removeLocker(id: number, user?: JwtUser) {
    const locker = await this.prisma.club_lockers.findUnique({ where: { id } });
    if (!locker) throw new NotFoundException('اللوكر غير موجود');
    this.assertBranchAccess(user, locker.main_branch_id);
    const subs = await this.prisma.club_locker_subscriptions.findMany({ where: { locker_id: id } });
    const today = localDateString();
    const hasActive = subs.some((s) => {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      return st === 'active' || st === 'upcoming';
    });
    if (hasActive) throw new BadRequestException('لا يمكن حذف اللوكر — يوجد اشتراك نشط');
    const openHandoff = await this.prisma.club_locker_handoffs.findFirst({
      where: { locker_id: id, released_at: null },
      select: { id: true },
    });
    if (openHandoff) throw new BadRequestException('لا يمكن حذف اللوكر — مع عضو دلوقتي');
    await this.prisma.$transaction([
      this.prisma.club_locker_handoffs.deleteMany({ where: { locker_id: id } }),
      this.prisma.club_lockers.delete({ where: { id } }),
    ]);
    return { success: true };
  }

  async lockerStatistics(user?: JwtUser) {
    const scope = this.branchScope.resolveListFilter(user, null);
    const branchWhere = scope === null ? {} : { main_branch_id: { in: scope } };
    const [lockers, subs] = await Promise.all([
      this.prisma.club_lockers.findMany({ where: branchWhere }),
      this.prisma.club_locker_subscriptions.findMany({ where: branchWhere }),
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
      status: row.status === 'frozen' || row.status === 'expired' ? row.status : deriveSubStatus(start, end),
      createdAt: row.created_at,
    };
  }

  async listSubscriptions(q: ListClubLockerSubscriptionsDto, user?: JwtUser) {
    const and: Prisma.club_locker_subscriptionsWhereInput[] = [];
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

    // Translate the status filter into a date-range predicate so it runs in the DB BEFORE pagination
    // — applying it in-memory to an already-paginated page corrupts both the page and the total.
    if (q.status && q.status !== 'all') {
      const mapped = STATUS_MAP[q.status] ?? q.status;
      const today = localDateString();
      if (mapped === 'frozen') and.push({ status: 'frozen' });
      else if (mapped === 'upcoming') and.push({ status: { notIn: ['frozen', 'expired'] }, subscription_start_date: { gt: today } });
      else if (mapped === 'expired') and.push({ OR: [{ status: 'expired' }, { status: { not: 'frozen' }, subscription_end_date: { lt: today } }] });
      else if (mapped === 'active')
        and.push({ status: { notIn: ['frozen', 'expired'] }, subscription_start_date: { lte: today }, subscription_end_date: { gte: today } });
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
      const next = nextSeqFromMax(rows[0]?.maxNum);
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
    const openHandoff = await db.club_locker_handoffs.findFirst({
      where: { locker_id: lockerId, released_at: null },
      select: { id: true },
    });
    if (openHandoff) return false;
    await db.club_lockers.update({ where: { id: lockerId }, data: { is_available: true } });
    return true;
  }

  async createSubscription(body: Record<string, unknown>, user: JwtUser) {
    const userId = user.sub;
    if (body.memberId != null && (!Number.isInteger(Number(body.memberId)) || Number(body.memberId) <= 0)) throw new BadRequestException('رقم العضو غير صالح');
    const lockerId = Number(body.lockerId);
    const mainBranchId = Number(body.mainBranchId);
    this.assertBranchAccess(user, mainBranchId);
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
    const end = body.subscriptionEndDate ? String(body.subscriptionEndDate) : resolveSubscriptionEndDate(start, type.days, false);
    assertDateOrder(start, end);

    return retryOnUniqueViolation(() => this.prisma.$transaction(async (tx) => {
      if (body.memberId != null) await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${Number(body.memberId)} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_lockers WHERE id = ${lockerId} FOR UPDATE`;
      const locker = await tx.club_lockers.findUnique({ where: { id: lockerId } });
      if (!locker) throw new NotFoundException('اللوكر غير موجود');
      if (locker.main_branch_id !== mainBranchId) {
        throw new BadRequestException('اللوكر غير تابع للفرع المختار');
      }
      if (!locker.is_available) throw new BadRequestException('اللوكر غير متاح للحجز');

      if (body.memberId != null) {
        const member = await tx.club_members.findUnique({
          where: { id: Number(body.memberId) },
          select: { branch_id: true, is_deleted: true },
        });
        if (!member || member.is_deleted) throw new NotFoundException('العضو غير موجود');
        if (member.branch_id !== mainBranchId) {
          throw new BadRequestException('لا يمكن ربط اشتراك لوكر بعضو من فرع آخر');
        }
      }

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
              branchId: mainBranchId,
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
          main_branch_id: mainBranchId,
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
    }));
  }

  async updateSubscription(id: number, body: Record<string, unknown>, user?: JwtUser) {
    if (body.memberId != null && (!Number.isInteger(Number(body.memberId)) || Number(body.memberId) <= 0)) throw new BadRequestException('رقم العضو غير صالح');
    const initial = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!initial) throw new NotFoundException('اشتراك اللوكر غير موجود');
    this.assertBranchAccess(user, initial.main_branch_id);
    const row = await this.prisma.$transaction(async tx => {
      const memberIds = [...new Set([initial.member_id, body.memberId != null ? Number(body.memberId) : null].filter((value): value is number => value != null))].sort((a, b) => a - b);
      for (const memberId of memberIds) await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_lockers WHERE id = ${initial.locker_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${id} FOR UPDATE`;
      const existing = await tx.club_locker_subscriptions.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('اشتراك اللوكر غير موجود');
      this.assertBranchAccess(user, existing.main_branch_id);
      if (body.memberId != null) {
        const member = await tx.club_members.findUnique({ where: { id: Number(body.memberId) }, select: { branch_id: true, is_deleted: true } });
        if (!member || member.is_deleted) throw new NotFoundException('العضو غير موجود');
        if (member.branch_id !== existing.main_branch_id) throw new BadRequestException('لا يمكن ربط اشتراك لوكر بعضو من فرع آخر');
      }
      const start = body.subscriptionStartDate ? String(body.subscriptionStartDate) : existing.subscription_start_date;
      const end = body.subscriptionEndDate ? String(body.subscriptionEndDate) : existing.subscription_end_date;
      assertDateOrder(start, end);
      if (existing.status === 'frozen' && (start !== existing.subscription_start_date || end !== existing.subscription_end_date)) {
        throw new BadRequestException('فك تجميد اللوكر قبل تعديل تواريخ الاشتراك');
      }
      const datesChanged = start !== existing.subscription_start_date || end !== existing.subscription_end_date;
      const newStatus = existing.status === 'frozen' ? 'frozen' : existing.status === 'expired' && !datesChanged ? 'expired' : deriveSubStatus(start, end);
      const oldStatus = existing.status === 'frozen' || existing.status === 'expired' ? existing.status : deriveSubStatus(existing.subscription_start_date, existing.subscription_end_date);
      if (newStatus !== 'expired' && oldStatus === 'expired') {
        const locker = await tx.club_lockers.findUnique({ where: { id: existing.locker_id } });
        if (!locker?.is_available) throw new BadRequestException('اللوكر غير متاح؛ لا يمكن إعادة تنشيط الاشتراك القديم');
      }
      let paymentDelta = 0;
      if (body.paidAmount != null) {
        const newPaid = Number(body.paidAmount);
        if (!Number.isFinite(newPaid) || newPaid < 0) throw new BadRequestException('المبلغ المدفوع غير صالح');
        assertOverpayCap(newPaid, lockerNetDue(toNum(existing.subscription_value), existing.discount_enabled, toNum(existing.discount_value)), 'المبلغ المدفوع أكبر من المستحق بعد الخصم');
        paymentDelta = Math.round((newPaid - toNum(existing.paid_amount)) * 100) / 100;
        if (paymentDelta < 0) throw new BadRequestException('لا يمكن تخفيض المبلغ المدفوع من هنا، استخدم الاسترداد');
      }
      if (paymentDelta > 0) await this.accounting.recordPayment(tx, {
        amount: paymentDelta, memberName: String(body.customerName ?? existing.customer_name), memberId: existing.member_id,
        branchId: existing.main_branch_id, paymentMethod: body.paymentMethod != null ? String(body.paymentMethod) : existing.payment_method,
        createdBy: user?.sub ?? existing.created_by ?? undefined, subscriptionNumber: existing.subscription_number,
      });
      const updated = await tx.club_locker_subscriptions.update({ where: { id }, data: {
        ...(body.customerName != null ? { customer_name: String(body.customerName) } : {}),
        ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
        ...(body.subscriptionStartDate != null ? { subscription_start_date: start } : {}),
        ...(body.subscriptionEndDate != null ? { subscription_end_date: end } : {}),
        ...(body.paidAmount != null ? { paid_amount: Number(body.paidAmount) } : {}), status: newStatus,
      } });
      if (newStatus === 'expired' && oldStatus !== 'expired') await this.freeLockerIfUnoccupied(existing.locker_id, id, tx);
      else if (newStatus !== 'expired' && oldStatus === 'expired') await tx.club_lockers.update({ where: { id: existing.locker_id }, data: { is_available: false } });
      return updated;
    });
    return this.mapSub(row);
  }

  async removeSubscription(id: number, user?: JwtUser) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    this.assertBranchAccess(user, sub.main_branch_id);
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM club_lockers WHERE id = ${sub.locker_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${id} FOR UPDATE`;
      await tx.club_locker_subscriptions.delete({ where: { id } });
      await this.freeLockerIfUnoccupied(sub.locker_id, id, tx);
    });
    return { success: true };
  }

  async releaseSubscription(id: number, user?: JwtUser) {
    const initial = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!initial) throw new NotFoundException('اشتراك اللوكر غير موجود');
    this.assertBranchAccess(user, initial.main_branch_id);
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM club_lockers WHERE id = ${initial.locker_id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${id} FOR UPDATE`;
      const sub = await tx.club_locker_subscriptions.findUnique({ where: { id } });
      if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
      this.assertBranchAccess(user, sub.main_branch_id);
      await tx.club_locker_subscriptions.update({ where: { id }, data: {
        status: 'expired', subscription_end_date: addDays(localDateString(), -1), freeze_start_date: null,
      } });
      await this.freeLockerIfUnoccupied(sub.locker_id, id, tx);
    });
    return { success: true };
  }

  async expireAndReleaseLockers(): Promise<{ subs: number; lockers: number }> {
    const today = localDateString();
    const due = await this.prisma.club_locker_subscriptions.findMany({
      where: { subscription_end_date: { lt: today }, status: { not: 'expired' } },
    });
    let subs = 0;
    let lockers = 0;
    for (const candidate of due) {
      const result = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM club_lockers WHERE id = ${candidate.locker_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${candidate.id} FOR UPDATE`;
        const current = await tx.club_locker_subscriptions.findUnique({ where: { id: candidate.id } });
        if (!current || current.status === 'expired' || current.subscription_end_date >= today) return null;
        await tx.club_locker_subscriptions.update({ where: { id: current.id }, data: { status: 'expired', freeze_start_date: null } });
        return { freed: await this.freeLockerIfUnoccupied(current.locker_id, current.id, tx) };
      });
      if (result) { subs++; if (result.freed) lockers++; }
    }
    return { subs, lockers };
  }

  async freezeSubscription(id: number, days: number, dryRun?: boolean, user?: JwtUser) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    this.assertBranchAccess(user, sub.main_branch_id);
    if (!sub.type.has_stop) throw new BadRequestException('نوع اشتراك اللوكر لا يدعم التجميد');
    if (sub.status !== 'active' || deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date) !== 'active') throw new BadRequestException('يمكن تجميد الاشتراك النشط فقط');
    if (!Number.isInteger(days) || days <= 0) throw new BadRequestException('عدد أيام التجميد يجب أن يكون عددًا صحيحًا موجبًا');
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

    const row = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${id} FOR UPDATE`;
      const current = await tx.club_locker_subscriptions.findUnique({ where: { id }, include: { type: true } });
      if (!current) throw new NotFoundException('اشتراك اللوكر غير موجود');
      this.assertBranchAccess(user, current.main_branch_id);
      if (!current.type.has_stop || current.status !== 'active' || deriveSubStatus(current.subscription_start_date, current.subscription_end_date) !== 'active') {
        throw new BadRequestException('يمكن تجميد الاشتراك النشط فقط');
      }
      if (current.type.stop_days != null && days > current.type.stop_days) throw new BadRequestException('عدد أيام التجميد يتجاوز السقف');
      return tx.club_locker_subscriptions.update({ where: { id }, data: {
        status: 'frozen', freeze_start_date: localDateString(), subscription_end_date: addDays(current.subscription_end_date, days),
      } });
    });
    return this.mapSub(row);
  }

  async unfreezeSubscription(id: number, dryRun?: boolean, user?: JwtUser) {
    const sub = await this.prisma.club_locker_subscriptions.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('اشتراك اللوكر غير موجود');
    this.assertBranchAccess(user, sub.main_branch_id);
    if (sub.status !== 'frozen') throw new BadRequestException('الاشتراك غير مجمد');

    const newStatus = deriveSubStatus(sub.subscription_start_date, sub.subscription_end_date);
    const previewRows: PreviewRow[] = [
      { label: 'الحالة', before: 'frozen', after: newStatus },
      { label: 'تاريخ النهاية', after: sub.subscription_end_date },
    ];
    if (isDryRun(dryRun)) {
      return previewResponse({ subscriptionId: id }, { rows: previewRows });
    }

    const row = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM club_locker_subscriptions WHERE id = ${id} FOR UPDATE`;
      const current = await tx.club_locker_subscriptions.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('اشتراك اللوكر غير موجود');
      this.assertBranchAccess(user, current.main_branch_id);
      if (current.status !== 'frozen') throw new BadRequestException('الاشتراك غير مجمد');
      return tx.club_locker_subscriptions.update({ where: { id }, data: {
        status: deriveSubStatus(current.subscription_start_date, current.subscription_end_date), freeze_start_date: null,
      } });
    });
    return this.mapSub(row);
  }
}
