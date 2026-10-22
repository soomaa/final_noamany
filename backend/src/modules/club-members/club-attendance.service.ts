import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import {
  ClubBranchGroupReader,
  ClubBranchGroupService,
} from "../../common/branch-groups/club-branch-group.service";
import { paginated } from "../../common/dto/list-result";
import { JwtUser } from "../../common/types/jwt-user";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";
import { BusinessAuditService } from "../gym-ops/business-audit.service";
import { EntitlementService } from "../gym-ops/entitlement.service";
import { AutomationEngineService } from "../gym-ops/automation-engine.service";
import { WebhookService } from "../webhooks/webhook.service";
import { localDateString } from "./club-member.utils";
import { CheckInDto, CheckOutDto, ServiceCheckInDto } from "./dto/check-in.dto";
import { ListClubAttendanceDto } from "./dto/list-club-attendance.dto";
import { BarcodeScanTimesDto } from "./dto/barcode-scan-times.dto";
import { BarcodeAttendanceReportDto } from "./dto/barcode-attendance-report.dto";
import { isReceptionEmployee } from "../../common/utils/reception-user.util";
import { assertSystemAdmin, isSystemAdmin } from "../../common/utils/system-admin.util";
import { ClubMembersService } from "./club-members.service";
import { ClubPointsService } from '../club-points/club-points.service';
import { recordPrivateAttendanceCommission } from "../club-subscriptions/private-attendance.util";
import {
  daysBetween,
  deriveSessionAwareStatus,
  deriveSubStatus,
  toNum,
} from "../club-subscriptions/club-subscription.utils";
import { clubMemberIdentityBranchIds, expandClubReportBranchIds, shareClubMemberIdentity } from "./club-branch-groups";

const EGYPT_TIME_ZONE = "Africa/Cairo";

function cairoDateTime(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EGYPT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

/** Convert a local Cairo clock minute to UTC, including Egypt's seasonal offset. */
function cairoMinuteToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  let utc = target - 2 * 60 * 60 * 1000;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(utc));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const actual = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    utc += target - actual;
  }
  return new Date(utc);
}

function validIsoDay(value: string): boolean {
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

@Injectable()
export class ClubAttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
    private readonly entitlement: EntitlementService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
    private readonly webhooks: WebhookService,
    private readonly permissions: PermissionEngineService,
    private readonly branchScope: BranchScopeService,
    @Inject(ClubBranchGroupService)
    private readonly branchGroups: Pick<
      ClubBranchGroupReader,
      "siblingBranchIds"
    > = {
      siblingBranchIds: async (branchId) => [branchId],
    },
    private readonly points?: ClubPointsService,
  ) {}

  /**
   * Attendance reads preserve their legacy report scope. Check-ins are allowed only at the
   * operator's own branch or a configured active sibling branch in the same club group.
   */
  private attendanceBranchIds(
    user?: JwtUser,
    requested?: string | number | null,
  ): number[] | null {
    if (!user) return [];
    if (user.level === 1 || user.is_super_admin)
      return expandClubReportBranchIds(
        this.branchScope.resolveListFilter(user, requested ?? null),
      );
    const ownBranchId = Number(user.branch ?? 0);
    if (!ownBranchId) return [];
    const requestedNumber =
      requested == null || requested === "" || requested === "all"
        ? null
        : Number(requested);
    if (
      requestedNumber != null &&
      Number.isFinite(requestedNumber) &&
      requestedNumber !== ownBranchId
    ) {
      throw new ForbiddenException("لا تملك صلاحية الوصول لحضور فرع آخر");
    }
    return expandClubReportBranchIds([ownBranchId]);
  }

  private async canOperateAttendanceBranch(
    user: JwtUser | undefined,
    branchId: number,
  ): Promise<boolean> {
    if (!user) return false;
    if (user.level === 1) return true;
    const operatorBranchId = Number(user.branch ?? 0);
    if (!Number.isInteger(operatorBranchId) || operatorBranchId <= 0) return false;
    const target = Number(branchId);
    if (operatorBranchId === target) return true;
    // Bidirectional check: group data is supposed to be symmetric, but if only one
    // side has a membership row (or the operator row is missing) the single-direction
    // lookup fails closed even though the branches share a group. Accept either direction.
    const [operatorSiblings, targetSiblings] = await Promise.all([
      this.branchGroups.siblingBranchIds(operatorBranchId),
      this.branchGroups.siblingBranchIds(target),
    ]);
    return (
      (operatorSiblings.includes(operatorBranchId) && operatorSiblings.includes(target)) ||
      (targetSiblings.includes(target) && targetSiblings.includes(operatorBranchId))
    );
  }

  /**
   * Expand a verified shared group or the built-in Tanta member identity.
   * Unrelated singleton/group lists must never be unioned: that would allow
   * every member's home branch through.
   */
  private async compatibleAttendanceBranches(
    firstBranchId: number,
    secondBranchId: number,
  ): Promise<number[]> {
    const [a, b] = await Promise.all([
      this.branchGroups.siblingBranchIds(firstBranchId),
      this.branchGroups.siblingBranchIds(secondBranchId),
    ]);
    const sharesGroup = firstBranchId === secondBranchId ||
      (a.includes(firstBranchId) && a.includes(secondBranchId)) ||
      (b.includes(secondBranchId) && b.includes(firstBranchId));
    const sharesMemberIdentity = shareClubMemberIdentity(firstBranchId, secondBranchId);
    if (!sharesGroup && !sharesMemberIdentity) return [firstBranchId];
    const compatible = sharesGroup ? a.concat(b) : [];
    if (sharesMemberIdentity) compatible.push(...clubMemberIdentityBranchIds(firstBranchId));
    return Array.from(new Set(compatible)).sort((x, y) => x - y);
  }

  /**
   * Attendance-desk lookup: resolve a member by code/card and return everything the operator
   * needs to verify before check-in — identity + photo, the latest subscriptions with their
   * status/freeze, current suspension days, and active locker rentals. Guarded by the same
   * attendance read permissions as the rest of the controller so reception staff without a
   * subscription/locker grant can still use the desk.
   */
  async memberOverview(code: string, user?: JwtUser, memberId?: string) {
    const normalized = (code ?? "").trim();
    const id = memberId === undefined ? null : Number(memberId);
    if (id !== null && (!Number.isInteger(id) || id <= 0)) throw new BadRequestException("كود العضو غير صالح");
    if (id === null && !normalized) throw new BadRequestException("أدخل كود العضو");

    const member = await this.prisma.club_members.findFirst({
      where: {
        is_deleted: false,
        ...(id !== null ? { id } : { OR: [{ member_code: normalized }, { card_number: normalized }] }),
      },
      include: { membership_type: { select: { id: true, name: true, price: true, duration_days: true } } },
    });
    if (!member) throw new NotFoundException("لا يوجد عضو بهذا الكود");

    const deskBranchId = Number(user?.branch ?? 0);
    const scope =
      deskBranchId > 0
        ? await this.compatibleAttendanceBranches(deskBranchId, member.branch_id)
        : expandClubReportBranchIds(this.branchScope.resolveListFilter(user, null));
    if (scope !== null && !scope.includes(member.branch_id)) {
      throw new ForbiddenException("لا تملك صلاحية الوصول لعضو في فرع آخر");
    }
    if (!this.branchScope.isMemberGenderAllowed(user, member.gender)) {
      throw new ForbiddenException("لا تملك صلاحية الوصول لبيانات هذا القسم");
    }

    const [subs, freezes, lockerSubs, lastAttendance, subscriptionCount, lockerSubscriptionCount, receipts, attendance, points] =
      await Promise.all([
        this.prisma.club_subscriptions.findMany({
          where: { member_id: member.id },
          orderBy: [{ registration_date: "desc" }, { id: "desc" }],
          include: {
            freezes: {
              where: { is_active: true },
              orderBy: { id: "desc" },
              take: 1,
            },
            type: {
              select: { name: true, includes_spa: true, spa_count: true, inbody_count: true },
            },
          },
        }),
        this.prisma.club_subscription_freezes.findMany({
          where: { subscription: { member_id: member.id } },
          orderBy: { id: "desc" },
          include: {
            subscription: {
              select: {
                id: true,
                subscription_number: true,
                subscription_type: true,
              },
            },
          },
        }),
        this.prisma.club_locker_subscriptions.findMany({
          where: { member_id: member.id },
          orderBy: { id: "desc" },
          include: { locker: true, type: true },
        }),
        this.prisma.club_attendance.findFirst({
          where: { member_id: member.id },
          orderBy: { id: "desc" },
          select: { check_in_time: true, attendance_date: true },
        }),
        this.prisma.club_subscriptions.count({ where: { member_id: member.id } }),
        this.prisma.club_locker_subscriptions.count({ where: { member_id: member.id } }),
        this.prisma.club_receipts.findMany({
          where: { OR: [{ member_id: member.id }, { subscription: { member_id: member.id } }, { locker_subscription: { member_id: member.id } }] },
          orderBy: [{ receipt_date: "desc" }, { id: "desc" }], take: 10,
          select: { id: true, receipt_number: true, receipt_date: true, amount: true, status: true, description: true },
        }),
        this.prisma.club_attendance.findMany({
          where: { member_id: member.id }, orderBy: [{ check_in_time: "desc" }, { id: "desc" }], take: 10,
          select: { id: true, check_in_time: true, check_out_time: true, subscription_type: true, attendance_type: true, notes: true },
        }),
        this.points ? this.points.history(member.id) : null,
      ]);

    const activeFreezes = freezes.filter((f) => f.is_active);
    const suspendedDays = activeFreezes.reduce(
      (sum, f) => sum + (f.actual_days ?? f.planned_days ?? 0),
      0,
    );
    const todayStr = localDateString();

    return {
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
        phone: member.phone,
        email: member.email,
        gender: member.gender,
        cardNumber: member.card_number,
        dateOfBirth: member.date_of_birth,
        address: member.address,
        maritalStatus: member.marital_status,
        jobTitle: member.job_title,
        profilePicture: member.profile_picture,
        notes: member.notes,
        branchId: member.branch_id,
        membershipTypeId: member.membership_type_id,
        membershipType: member.membership_type ? {
          id: member.membership_type.id,
          name: member.membership_type.name,
          price: toNum(member.membership_type.price),
          durationDays: member.membership_type.duration_days,
        } : null,
        startDate: member.start_date,
        endDate: member.end_date,
        isActive: member.is_active,
        salesId: member.sales_id,
        employeeId: member.employee_id,
        guardianName: member.guardian_name,
        guardianPhone: member.guardian_phone,
        isBlocked: member.is_blocked,
        blockReason: member.block_reason,
        blockedAt: member.blocked_at,
        blockedBy: member.blocked_by,
        createdAt: member.created_at,
        updatedAt: member.updated_at,
        lastCheckIn: lastAttendance?.check_in_time ?? null,
      },
      subscriptionCount,
      lockerSubscriptionCount,
      suspendedDays,
      frozenCount: activeFreezes.length,
      points,
      recentReceipts: receipts.map((r) => ({ id: r.id, receiptNumber: r.receipt_number, date: r.receipt_date, amount: toNum(r.amount), status: r.status, description: r.description })),
      recentAttendance: attendance.map((a) => ({ id: a.id, checkIn: a.check_in_time, checkOut: a.check_out_time, subscriptionType: a.subscription_type, type: a.attendance_type, notes: a.notes })),
      freezes: freezes.map((f) => ({
        subscriptionId: f.subscription_id,
        subscriptionNumber: f.subscription?.subscription_number ?? null,
        subscriptionType:
          f.subscription?.subscription_type ?? null,
        startDate: f.freeze_start_date,
        endDate: f.freeze_end_date,
        plannedDays: f.planned_days,
        actualDays: f.actual_days,
        isActive: f.is_active,
        reason: f.reason,
      })),
      subscriptions: subs.map((s) => {
        const status =
          s.status === "frozen"
            ? "frozen"
            : deriveSessionAwareStatus({
                startDate: s.subscription_start_date,
                endDate: s.subscription_end_date,
                isLinkedToSessions: s.is_linked_to_sessions,
                sessionsCount: s.sessions_count,
                sessionsUsed: s.sessions_used,
              });
        const freeze = s.freezes[0];
        const spaUsed = s.spa_used ?? 0;
        const inbodyUsed = s.inbody_used ?? 0;
        let daysRemaining: number | null = null;
        let daysOverdue: number | null = null;
        let daysUntilStart: number | null = null;
        if (status === "active") {
          daysRemaining = Math.max(0, daysBetween(todayStr, s.subscription_end_date));
        } else if (status === "expired") {
          daysOverdue = Math.max(0, daysBetween(s.subscription_end_date, todayStr));
        } else if (status === "upcoming") {
          daysUntilStart = Math.max(0, daysBetween(todayStr, s.subscription_start_date));
        }
        return {
          id: s.id,
          subscriptionNumber: s.subscription_number,
          subscriptionType: s.subscription_type,
          subscriptionTypeName: s.type?.name ?? s.subscription_type,
          branchId: s.branch_id,
          startDate: s.subscription_start_date,
          endDate: s.subscription_end_date,
          status,
          isLinkedToSessions: s.is_linked_to_sessions,
          sessionsCount: s.sessions_count,
          sessionsUsed: s.sessions_used,
          isLinkedToSpa:
            (s.type?.includes_spa ?? false) ||
            (s.type?.spa_count ?? 0) > 0 ||
            spaUsed > 0,
          spaCount: s.type?.spa_count ?? null,
          spaUsed,
          inbodyCount: s.type?.inbody_count ?? null,
          inbodyUsed,
          daysRemaining,
          daysOverdue,
          daysUntilStart,
          paidAmount: toNum(s.paid_amount),
          remainingAmount: toNum(s.remaining_amount),
          activeFreeze: freeze
            ? {
                startDate: freeze.freeze_start_date,
                plannedEndDate: freeze.freeze_end_date,
                plannedDays: freeze.planned_days,
                actualDays: freeze.actual_days,
                reason: freeze.reason,
              }
            : null,
        };
      }).sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')).slice(0, 10),
      lockerSubscriptions: lockerSubs.map((s) => ({
        id: s.id,
        subscriptionNumber: s.subscription_number,
        branchId: s.sub_branch_id ?? s.locker?.sub_branch_id ?? s.main_branch_id,
        lockerNumber: s.locker?.locker_number ?? null,
        subscriptionTypeName: s.type?.name ?? null,
        startDate: s.subscription_start_date,
        endDate: s.subscription_end_date,
        status: deriveSubStatus(s.subscription_start_date, s.subscription_end_date),
        paidAmount: toNum(s.paid_amount),
        remainingAmount: Math.max(
          0,
          toNum(s.subscription_value) -
            (s.discount_enabled ? toNum(s.discount_value) : 0) -
            toNum(s.paid_amount),
        ),
      })),
    };
  }

  private mapRow(row: {
    id: number;
    member_id: number;
    member_code: string;
    member_name: string;
    subscription_id: number | null;
    subscription_type: string | null;
    branch_id: number;
    check_in_time: Date;
    check_out_time: Date | null;
    attendance_date: string;
    attendance_type?: string;
    status: string;
    duration: number | null;
    notes: string | null;
    is_grace_session?: boolean;
    override_reason?: string | null;
    created_by: number | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      memberId: row.member_id,
      memberCode: row.member_code,
      memberName: row.member_name,
      subscriptionId: row.subscription_id,
      subscriptionType: row.subscription_type,
      branchId: row.branch_id,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      attendanceDate: row.attendance_date,
      attendanceType: row.attendance_type ?? 'normal',
      status: row.status,
      duration: row.duration,
      notes: row.notes,
      isGraceSession: row.is_grace_session ?? false,
      overrideReason: row.override_reason ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  /**
   * Special subscriptions are configured as weekly trainer slots. Materialize the
   * current slot on demand so reception attendance does not depend on somebody
   * manually generating the week from the scheduling screen first.
   */
  private async materializeCurrentSpecialClass(
    classTypeId: number,
    branchId: number,
    date: string,
    time: string,
  ) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const slot = await this.prisma.club_trainer_schedule_slots.findFirst({
      where: {
        class_type_id: classTypeId,
        branch_id: branchId,
        weekday,
        start_time: { lte: time },
        end_time: { gte: time },
        is_active: true,
      },
      include: {
        trainer: {
          select: { id: true, name: true, is_active: true, is_deleted: true },
        },
        hall: { select: { name: true } },
        class_type: {
          select: {
            id: true,
            name: true,
            single_session_price: true,
            is_active: true,
            is_deleted: true,
          },
        },
      },
      orderBy: [{ start_time: "desc" }, { id: "asc" }],
    });
    if (
      !slot ||
      !slot.trainer.is_active ||
      slot.trainer.is_deleted ||
      !slot.class_type.is_active ||
      slot.class_type.is_deleted
    ) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const lockKey = `special_cls_${slot.id}_${date}`;
      await tx.$queryRaw`SELECT GET_LOCK(${lockKey}, 10)`;
      try {
        const existing = await tx.club_classes.findFirst({
          where: {
            trainer_schedule_slot_id: slot.id,
            class_type_id: classTypeId,
            class_date: date,
            is_deleted: false,
          },
          include: {
            trainer: { select: { id: true, name: true } },
            hall: { select: { name: true } },
          },
          orderBy: { id: "asc" },
        });
        if (existing) return existing;

        return tx.club_classes.create({
          data: {
            class_type_id: classTypeId,
            trainer_schedule_slot_id: slot.id,
            class_name: slot.class_type.name,
            trainer_id: slot.trainer_id,
            branch_id: slot.branch_id,
            hall_id: slot.hall_id,
            class_date: date,
            start_time: slot.start_time,
            end_time: slot.end_time,
            max_capacity: slot.max_capacity,
            price: slot.class_type.single_session_price,
            status: "scheduled",
          },
          include: {
            trainer: { select: { id: true, name: true } },
            hall: { select: { name: true } },
          },
        });
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey})`;
      }
    });
  }

  async checkInService(dto: ServiceCheckInDto, user: JwtUser) {
    const required = dto.attendanceType === 'class'
      ? ['club.fitness:update', 'club.subscriptions.special:update', 'club.members.attendance:create', 'club.reception:create']
      : ['club.fitness:create', 'club.members.attendance:create', 'club.reception:create'];
    if (!(await this.permissions.canAny(user.sub, required))) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل حضور هذه الخدمة');
    }
    if (dto.attendanceType === 'class') {
      const sub = await this.prisma.club_subscriptions.findUnique({ where: { id: dto.subscriptionId } });
      if (!sub || sub.member_id !== dto.memberId || !sub.is_linked_to_sessions) {
        throw new BadRequestException('الاشتراك غير مرتبط بحصص لهذا العضو');
      }
      return this.checkIn({ ...dto, attendanceType: 'class', consumeSession: true }, user);
    }
    const member = await this.members.resolveByIdOrCode(dto.memberId, undefined);
    const branchId = Number(user.branch || member.branch_id);
    if (!(await this.canOperateAttendanceBranch(user, branchId))) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل حضور في هذا الفرع');
    }
    const branchIds = await this.compatibleAttendanceBranches(branchId, member.branch_id);
    if (!branchIds.includes(member.branch_id)) {
      throw new ForbiddenException('لا يمكن تسجيل حضور عضو تابع لفرع آخر');
    }
    const entitlement = await this.entitlement.validate({ memberId: member.id, branchId, branchIds, subscriptionId: dto.subscriptionId });
    if (!entitlement.allowed) {
      throw new BadRequestException({ message: 'لا يمكن تسجيل حضور الخدمة — تحقق من الاشتراك', entitlement });
    }
    const now = new Date();
    const local = cairoDateTime(now);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${dto.subscriptionId} FOR UPDATE`;
      const sub = await tx.club_subscriptions.findUnique({ where: { id: dto.subscriptionId }, include: { type: true } });
      if (!sub || sub.member_id !== member.id || !branchIds.includes(sub.branch_id)
        || sub.status !== 'active' || sub.subscription_start_date > local.date || sub.subscription_end_date < local.date) {
        throw new BadRequestException('الاشتراك غير متاح لهذا العضو');
      }
      const spa = dto.attendanceType === 'spa';
      // A positive SPA allowance also marks legacy packages as linked in the overview.
      const total = spa ? sub.type?.spa_count : sub.type?.inbody_count;
      const used = spa ? sub.spa_used : sub.inbody_used;
      if (total == null || used >= total) throw new BadRequestException('لا يوجد رصيد متبقٍ لهذه الخدمة');
      const duplicate = await tx.club_attendance.findFirst({ where: {
        member_id: member.id, subscription_id: sub.id, attendance_date: local.date, attendance_type: dto.attendanceType,
      } });
      if (duplicate) throw new BadRequestException('تم تسجيل حضور هذه الخدمة بالفعل اليوم');
      await tx.club_subscriptions.update({ where: { id: sub.id }, data: spa
        ? { spa_used: { increment: 1 } } : { inbody_used: { increment: 1 } } });
      if (spa) {
        await tx.club_spa_attendance.create({ data: {
          member_id: member.id, member_code: member.member_code, member_name: member.name,
          branch_id: branchId, subscription_id: sub.id, attendance_date: local.date,
          check_in_time: local.time, created_by: user.sub,
        } });
      }
      return tx.club_attendance.create({ data: {
        member_id: member.id, member_code: member.member_code, member_name: member.name,
        branch_id: branchId, subscription_id: sub.id, subscription_type: sub.subscription_type,
        attendance_date: local.date, attendance_type: dto.attendanceType,
        check_in_time: now, check_out_time: now, status: 'checked_out', duration: 0, created_by: user.sub,
      } });
    });
    await this.audit.log({ entityType: 'club_attendance', entityId: row.id, action: 'check_in',
      actorUserId: user.sub, branchId, after: this.mapRow(row) });
    return { attendance: this.mapRow(row) };
  }

  async checkIn(dto: CheckInDto, user: JwtUser) {
    const userId = user.sub;
    const member = await this.members.resolveByIdOrCode(
      dto.memberId,
      dto.memberCode,
    );
    // Physical location first: an explicit branch, else the operator's own branch,
    // else the member's home branch (legacy fallback). Recording at the operator
    // branch keeps cross-branch visits in the correct daily report.
    const operatorBranchId = Number(user?.branch ?? 0);
    const branchId =
      dto.branchId ?? (operatorBranchId > 0 ? operatorBranchId : member.branch_id);
    if (!(await this.canOperateAttendanceBranch(user, branchId))) {
      throw new ForbiddenException("لا تملك صلاحية تسجيل حضور في هذا الفرع");
    }
    const compatibleBranchIds = await this.compatibleAttendanceBranches(
      branchId,
      member.branch_id,
    );
    if (!compatibleBranchIds.includes(member.branch_id)) {
      throw new ForbiddenException("لا يمكن تسجيل حضور عضو تابع لفرع آخر");
    }

    if (dto.subscriptionId != null) {
      const selectedSubscription =
        await this.prisma.club_subscriptions.findUnique({
          where: { id: dto.subscriptionId },
          select: { member_id: true, branch_id: true },
        });
      if (
        !selectedSubscription ||
        selectedSubscription.member_id !== member.id
      ) {
        throw new BadRequestException("الاشتراك غير موجود لهذا العضو");
      }
      if (!compatibleBranchIds.includes(selectedSubscription.branch_id)) {
        throw new ForbiddenException("لا يمكن استخدام اشتراك تابع لفرع آخر");
      }
    }

    const entitlement = await this.entitlement.validate({
      memberId: member.id,
      branchId,
      branchIds: compatibleBranchIds,
      subscriptionId: dto.subscriptionId,
    });

    if (!entitlement.allowed && !dto.force) {
      throw new BadRequestException({
        message: "لا يمكن تسجيل الدخول — تحقق من الاشتراك",
        entitlement,
      });
    }

    if (!entitlement.allowed && dto.force) {
      if (
        entitlement.reasons.some((reason) => reason.code === "member_blocked")
      ) {
        throw new ForbiddenException(
          "العضو محظور ولا يمكن تجاوز الحظر من شاشة الحضور",
        );
      }
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException(
          "يجب إدخال سبب التجاوز عند تسجيل الدخول بالقوة",
        );
      }
      // Overriding an expired/outstanding entitlement is an approval, not a normal check-in.
      const mayApprove = await this.permissions.canAny(userId, [
        "club.reception:approve",
        "club.members.attendance:approve",
      ]);
      if (!mayApprove) {
        throw new ForbiddenException(
          "لا تملك صلاحية السماح بالدخول رغم رفض الاشتراك",
        );
      }
      await this.audit.log({
        entityType: "club_member",
        entityId: member.id,
        action: "check_in.override",
        actorUserId: userId,
        branchId,
        reason: dto.overrideReason.trim(),
        after: {
          graceSession: true,
          overrideReason: dto.overrideReason.trim(),
          subscriptionId:
            dto.subscriptionId ??
            entitlement.activeSubscription?.id ??
            entitlement.latestSubscription?.id ??
            null,
          subscriptionEndDate:
            entitlement.activeSubscription?.endDate ??
            entitlement.latestSubscription?.endDate ??
            null,
          subscriptionType:
            entitlement.activeSubscription?.subscriptionType ??
            entitlement.latestSubscription?.subscriptionType ??
            null,
          entitlement,
        },
      });
    }

    // Prefer the evaluated subscription; on grace with no pick, attach the latest expired one.
    const isGrace = !entitlement.allowed && !!dto.force;
    let chosenSub = entitlement.activeSubscription;
    if (!chosenSub && isGrace && entitlement.latestSubscription) {
      chosenSub = entitlement.latestSubscription;
    }
    const now = new Date();
    const localNow = cairoDateTime(now);
    const today = localNow.date;
    let specialClass =
      dto.attendanceType !== 'normal' && !isGrace && chosenSub?.specialClassTypeId
        ? await this.prisma.club_classes.findFirst({
            where: {
              class_type_id: chosenSub.specialClassTypeId,
              branch_id: branchId,
              class_date: today,
              start_time: { lte: localNow.time },
              end_time: { gte: localNow.time },
              status: { in: ["scheduled", "ongoing"] },
              is_active: true,
              is_deleted: false,
            },
            include: {
              trainer: { select: { id: true, name: true } },
              hall: { select: { name: true } },
            },
            orderBy: [{ start_time: "desc" }, { id: "asc" }],
          })
        : null;

    if (dto.attendanceType !== 'normal' && chosenSub?.specialClassTypeId && !specialClass && !isGrace) {
      specialClass = await this.materializeCurrentSpecialClass(
        chosenSub.specialClassTypeId,
        branchId,
        today,
        localNow.time,
      );
    }

    const privatePackage =
      chosenSub && !isGrace
        ? await this.prisma.club_subscriptions.findUnique({
            where: { id: chosenSub.id },
            select: { private_package_id: true },
          })
        : null;
    const isPrivate = privatePackage?.private_package_id != null;

    if (dto.attendanceType !== 'normal' && chosenSub?.specialClassTypeId && !specialClass && !isGrace) {
      throw new BadRequestException(
        "لا توجد حصة مجدولة لهذا الاشتراك في الوقت الحالي",
      );
    }

    const row = await this.prisma.$transaction(
      async (tx) => {
        const lockKey = specialClass
          ? `special_att_${specialClass.id}_${member.id}`
          : null;
        if (lockKey) await tx.$queryRaw`SELECT GET_LOCK(${lockKey}, 10)`;
        try {
          if (specialClass) {
            const alreadyAttended = await tx.club_class_enrollments.findUnique({
              where: {
                class_id_member_id: {
                  class_id: specialClass.id,
                  member_id: member.id,
                },
              },
            });
            if (alreadyAttended?.attendance_status === "attended") {
              throw new BadRequestException(
                "تم تسجيل حضور العضو في هذه الحصة بالفعل",
              );
            }
          }

          // A member may use a monthly subscription and a class subscription on the same day.
          // Close only the open visit that belongs to the currently selected subscription.
          const existing = await tx.club_attendance.findFirst({
            where: {
              member_id: member.id,
              attendance_date: today,
              status: "checked_in",
              ...(dto.attendanceType ? { attendance_type: dto.attendanceType } : {}),
              ...(dto.subscriptionId != null
                ? { subscription_id: dto.subscriptionId }
                : {}),
            },
          });
          if (existing) {
            await tx.club_attendance.update({
              where: { id: existing.id },
              data: {
                check_out_time: now,
                status: "checked_out",
                duration: Math.floor(
                  (now.getTime() - existing.check_in_time.getTime()) / 60000,
                ),
              },
            });
          }

          if (
            dto.attendanceType !== 'normal' && (dto.consumeSession || specialClass || isPrivate) &&
            chosenSub?.isLinkedToSessions &&
            !isGrace
          ) {
            const consumed = await tx.$executeRaw`
            UPDATE club_subscriptions
            SET sessions_used = sessions_used + 1
            WHERE id = ${chosenSub.id}
              AND is_linked_to_sessions = 1
              AND sessions_count IS NOT NULL
              AND sessions_used < sessions_count
          `;
            if (consumed !== 1)
              throw new BadRequestException("لا توجد حصص متبقية");
          }

          const attendance = await tx.club_attendance.create({
            data: {
              member_id: member.id,
              member_code: member.member_code,
              member_name: member.name,
              subscription_id: chosenSub?.id ?? null,
              subscription_type: chosenSub?.subscriptionType ?? null,
              branch_id: branchId,
              attendance_date: today,
              attendance_type: dto.attendanceType ?? (specialClass || isPrivate || dto.consumeSession ? 'class' : 'normal'),
              check_in_time: now,
              status: "checked_in",
              notes: dto.notes || null,
              is_grace_session: isGrace,
              override_reason: isGrace
                ? dto.overrideReason!.trim().slice(0, 255)
                : null,
              created_by: userId,
            },
          });

          if (specialClass && chosenSub) {
            await tx.club_class_enrollments.upsert({
              where: {
                class_id_member_id: {
                  class_id: specialClass.id,
                  member_id: member.id,
                },
              },
              create: {
                class_id: specialClass.id,
                member_id: member.id,
                enrollment_date: today,
                attendance_status: "attended",
                attendance_time: localNow.time,
                booking_source: "reception_auto",
                subscription_id: chosenSub.id,
              },
              update: {
                attendance_status: "attended",
                attendance_time: localNow.time,
                booking_source: "reception_auto",
                subscription_id: chosenSub.id,
              },
            });
          }
          if (dto.attendanceType !== 'normal' && isPrivate && chosenSub && !isGrace) {
            await recordPrivateAttendanceCommission(tx, {
              attendanceId: attendance.id,
              subscriptionId: chosenSub.id,
              attendanceDate: today,
            });
          }
          return attendance;
        } finally {
          if (lockKey) await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey})`;
        }
      },
      { maxWait: 10000, timeout: 15000 },
    );

    await this.audit.log({
      entityType: "club_attendance",
      entityId: row.id,
      action: "check_in",
      actorUserId: userId,
      branchId,
      after: this.mapRow(row),
    });

    void this.automation.emit("member_checked_in", {
      memberId: member.id,
      branchId,
      memberName: member.name,
    });

    void this.webhooks.dispatch("member_checked_in", {
      memberId: member.id,
      memberCode: member.member_code,
      memberName: member.name,
      branchId,
      attendanceId: row.id,
      checkInTime: row.check_in_time,
    });

    // Detail for the receptionist: which subscription was used and (for session packages)
    // the remaining sessions after this check-in consumed one.
    const consumedSession = Boolean(
      dto.attendanceType !== 'normal' && (dto.consumeSession || specialClass || isPrivate) &&
      chosenSub?.isLinkedToSessions &&
      !isGrace,
    );
    const sessionsRemainingAfter = chosenSub?.isLinkedToSessions
      ? Math.max(
          0,
          (chosenSub.sessionsRemaining ?? 0) - (consumedSession ? 1 : 0),
        )
      : null;

    return {
      attendance: this.mapRow(row),
      entitlement,
      subscription: chosenSub
        ? {
            id: chosenSub.id,
            type: chosenSub.subscriptionType,
            isLinkedToSessions: chosenSub.isLinkedToSessions,
            sessionsRemaining: sessionsRemainingAfter,
            daysRemaining: chosenSub.isLinkedToSessions
              ? null
              : (chosenSub.daysRemaining ?? null),
            endDate: chosenSub.endDate,
            consumedSession,
          }
        : null,
      classAttendance: specialClass
        ? {
            classId: specialClass.id,
            className: specialClass.class_name,
            trainerId: specialClass.trainer.id,
            trainerName: specialClass.trainer.name,
            hallName: specialClass.hall?.name ?? null,
            startTime: specialClass.start_time,
            endTime: specialClass.end_time,
          }
        : null,
      overridden: Boolean(dto.force && !entitlement.allowed),
    };
  }

  async checkOut(dto: CheckOutDto, user?: JwtUser) {
    const today = localDateString();
    let row;

    if (dto.attendanceId) {
      row = await this.prisma.club_attendance.findUnique({
        where: { id: dto.attendanceId },
      });
    } else {
      const member = await this.members.resolveByIdOrCode(
        dto.memberId,
        dto.memberCode,
      );
      row = await this.prisma.club_attendance.findFirst({
        where: {
          member_id: member.id,
          attendance_date: today,
          status: "checked_in",
        },
        orderBy: { check_in_time: "desc" },
      });
    }

    if (!row)
      throw new NotFoundException("لا يوجد تسجيل دخول مفتوح لهذا العضو اليوم");
    if (!(await this.canOperateAttendanceBranch(user, row.branch_id))) {
      throw new ForbiddenException("لا تملك صلاحية تسجيل خروج في هذا الفرع");
    }
    if (row.status === "checked_out")
      throw new BadRequestException("تم تسجيل الخروج مسبقاً");

    const checkOutTime = new Date();
    const duration = Math.floor(
      (checkOutTime.getTime() - row.check_in_time.getTime()) / 60000,
    );

    const updated = await this.prisma.club_attendance.update({
      where: { id: row.id },
      data: { check_out_time: checkOutTime, status: "checked_out", duration },
    });

    await this.audit.log({
      entityType: "club_attendance",
      entityId: updated.id,
      action: "check_out",
      actorUserId: user?.sub,
      branchId: updated.branch_id,
      after: this.mapRow(updated),
    });

    return this.mapRow(updated);
  }

  /** Auto check-out stale open visits (previous days or >8h same day). */
  async autoCheckoutStale() {
    const today = localDateString();
    const staleCutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const openRows = await this.prisma.club_attendance.findMany({
      where: {
        status: "checked_in",
        OR: [
          { attendance_date: { lt: today } },
          { check_in_time: { lt: staleCutoff } },
        ],
      },
    });
    let count = 0;
    for (const row of openRows) {
      const checkOutTime = new Date();
      const duration = Math.floor(
        (checkOutTime.getTime() - row.check_in_time.getTime()) / 60000,
      );
      await this.prisma.club_attendance.update({
        where: { id: row.id },
        data: { check_out_time: checkOutTime, status: "checked_out", duration },
      });
      count++;
    }
    return { checkedOut: count };
  }

  async list(q: ListClubAttendanceDto, user?: JwtUser) {
    const and: Prisma.club_attendanceWhereInput[] = [];

    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.startDate && q.endDate) {
      and.push({ attendance_date: { gte: q.startDate, lte: q.endDate } });
    } else if (q.startDate) {
      and.push({ attendance_date: { gte: q.startDate } });
    } else if (q.endDate) {
      and.push({ attendance_date: { lte: q.endDate } });
    }
    if (q.status && q.status !== "all")
      and.push({ status: q.status as "checked_in" | "checked_out" });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { member_name: { contains: s } },
          { member_code: { contains: s } },
        ],
      });
    }

    const where: Prisma.club_attendanceWhereInput = and.length
      ? { AND: and }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.club_attendance.findMany({
        where,
        orderBy: { check_in_time: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_attendance.count({ where }),
    ]);

    return paginated(
      rows.map((r) => this.mapRow(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Barcode pull times, filtered by the local Cairo scan clock. */
  async barcodeScanTimes(q: BarcodeScanTimesDto, user: JwtUser) {
    // Reception employees only ever see today's scans, whatever range they send.
    const todayOnly = isReceptionEmployee(user);
    if (todayOnly) {
      const today = cairoDateTime().date;
      q.startDate = today;
      q.endDate = today;
    }
    if (!q.startDate || !q.endDate || !validIsoDay(q.startDate) || !validIsoDay(q.endDate)) {
      throw new BadRequestException('حدد تاريخ بداية ونهاية صحيحين');
    }
    const startDay = new Date(`${q.startDate}T00:00:00Z`);
    const endDay = new Date(`${q.endDate}T00:00:00Z`);
    const spanDays = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000);
    if (spanDays < 0 || spanDays > 366) throw new BadRequestException('الفترة يجب ألا تتجاوز سنة واحدة');
    if (q.fromTime && q.toTime && q.fromTime > q.toTime) {
      throw new BadRequestException('وقت البداية يجب أن يسبق وقت النهاية');
    }

    const and: Prisma.club_attendanceWhereInput[] = [
      { attendance_date: { gte: q.startDate, lte: q.endDate } },
    ];
    const branches = this.attendanceBranchIds(user, q.branch ?? null);
    if (branches !== null) and.push({ branch_id: { in: branches } });
    const audience = this.branchScope.memberGenderFilter(user);
    if (audience) and.push({ member: { is: { gender: audience } } });
    if (q.gender && q.gender !== 'all') and.push({ member: { is: { gender: q.gender } } });
    if (q.memberCode?.trim()) and.push({ member_code: { contains: q.memberCode.trim() } });
    if (q.search?.trim()) {
      const search = q.search.trim();
      and.push({ OR: [{ member_code: { contains: search } }, { member_name: { contains: search } }] });
    }
    if (q.fromTime || q.toTime) {
      const days: Prisma.club_attendanceWhereInput[] = [];
      for (let offset = 0; offset <= spanDays; offset += 1) {
        const day = new Date(startDay.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
        const from = cairoMinuteToUtc(day, q.fromTime ?? '00:00');
        const to = new Date(cairoMinuteToUtc(day, q.toTime ?? '23:59').getTime() + 60_000);
        days.push({ attendance_date: day, check_in_time: { gte: from, lt: to } });
      }
      and.push({ OR: days });
    }

    const where: Prisma.club_attendanceWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_attendance.findMany({
        where,
        select: {
          id: true, member_code: true, member_name: true, branch_id: true,
          attendance_date: true, check_in_time: true, is_grace_session: true, attendance_type: true,
        },
        orderBy: [{ check_in_time: 'asc' }, { id: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_attendance.count({ where }),
    ]);
    return {
      ...paginated(rows.map((row) => ({
        id: row.id,
        memberCode: row.member_code,
        memberName: row.member_name,
        branchId: row.branch_id,
        attendanceDate: row.attendance_date,
        checkInTime: row.check_in_time,
        scanType: row.is_grace_session ? 'استثناء' : ({ normal: 'عادي', class: 'حصص', spa: 'سبا', inbody: 'إنبودي' } as Record<string, string>)[row.attendance_type ?? 'normal'] ?? 'عادي',
      })), total, q.page, q.pageSize),
      todayOnly,
    };
  }

  /**
   * One report shape for member / class / SPA attendance. Rows come from three tables:
   * club_attendance (reception & service check-ins), club_spa_attendance (SPA scanner) and
   * club_class_enrollments (class scanner). Mirrored rows are excluded so a visit appears once.
   * Reception employees only ever see today's rows; only system admins may delete.
   */
  async barcodeAttendanceReport(q: BarcodeAttendanceReportDto, user: JwtUser) {
    const todayOnly = isReceptionEmployee(user);
    const today = cairoDateTime().date;
    const dateFrom = todayOnly ? today : q.dateFrom;
    const dateTo = todayOnly ? today : q.dateTo;
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    const search = q.search?.trim() ? `%${q.search.trim()}%` : null;

    const filters = (alias: string, dateCol: string, branchCol: string, nameCol: string, codeCol: string) => {
      const parts: Prisma.Sql[] = [];
      if (dateFrom) parts.push(Prisma.sql`${Prisma.raw(`${alias}.${dateCol}`)} >= ${dateFrom}`);
      if (dateTo) parts.push(Prisma.sql`${Prisma.raw(`${alias}.${dateCol}`)} <= ${dateTo}`);
      if (scope !== null) {
        parts.push(scope.length
          ? Prisma.sql`${Prisma.raw(branchCol)} IN (${Prisma.join(scope)})`
          : Prisma.sql`1 = 0`);
      }
      if (search) parts.push(Prisma.sql`(${Prisma.raw(nameCol)} LIKE ${search} OR ${Prisma.raw(codeCol)} LIKE ${search})`);
      return parts;
    };
    const where = (parts: Prisma.Sql[]) => (parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}` : Prisma.empty);

    const attendanceParts = filters('a', 'attendance_date', 'a.branch_id', 'a.member_name', 'a.member_code');
    if (q.kind === 'class') attendanceParts.push(Prisma.sql`a.attendance_type = 'class'`);
    const attendanceSql = Prisma.sql`SELECT 'a' AS src, a.id AS id, a.check_in_time AS sort_at FROM club_attendance a ${where(attendanceParts)}`;

    const spaParts = filters('s', 'attendance_date', 's.branch_id', 's.member_name', 's.member_code');
    if (q.kind === 'member') {
      // Service check-ins write both tables; keep only the club_attendance copy in the member report.
      spaParts.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM club_attendance x WHERE x.member_id = s.member_id
        AND x.attendance_date = s.attendance_date AND x.subscription_id = s.subscription_id AND x.attendance_type = 'spa')`);
    }
    const spaSql = Prisma.sql`SELECT 's' AS src, s.id AS id, s.created_at AS sort_at FROM club_spa_attendance s ${where(spaParts)}`;

    const enrollmentParts = filters('c', 'class_date', 'c.branch_id', 'm.name', 'm.member_code');
    // reception_auto enrollments already have a club_attendance row of type "class".
    enrollmentParts.push(Prisma.sql`e.attendance_status = 'attended'`, Prisma.sql`e.booking_source <> 'reception_auto'`, Prisma.sql`c.is_deleted = 0`);
    const enrollmentSql = Prisma.sql`SELECT 'e' AS src, e.id AS id, e.updated_at AS sort_at
      FROM club_class_enrollments e JOIN club_classes c ON c.id = e.class_id JOIN club_members m ON m.id = e.member_id ${where(enrollmentParts)}`;

    const sources = q.kind === 'spa' ? [spaSql] : q.kind === 'class' ? [attendanceSql, enrollmentSql] : [attendanceSql, spaSql, enrollmentSql];
    const unionSql = Prisma.join(sources, ' UNION ALL ');
    const [keys, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ src: string; id: number; sort_at: Date }[]>(
        Prisma.sql`SELECT src, id, sort_at FROM (${unionSql}) r ORDER BY sort_at DESC, id DESC LIMIT ${q.take} OFFSET ${q.skip}`,
      ),
      this.prisma.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS cnt FROM (${unionSql}) r`),
    ]);
    const idsOf = (src: string) => keys.filter((k) => k.src === src).map((k) => Number(k.id));
    const [attendanceRows, spaRows, enrollmentRows] = await Promise.all([
      this.prisma.club_attendance.findMany({ where: { id: { in: idsOf('a') } } }),
      this.prisma.club_spa_attendance.findMany({ where: { id: { in: idsOf('s') } } }),
      this.prisma.club_class_enrollments.findMany({ where: { id: { in: idsOf('e') } }, include: { class: { select: { branch_id: true, class_date: true } } } }),
    ]);
    const subscriptionIds = [...new Set([...spaRows.map((r) => r.subscription_id), ...enrollmentRows.map((r) => r.subscription_id)].filter((id): id is number => id != null))];
    const memberIds = [...new Set(enrollmentRows.map((r) => r.member_id))];
    const userIds = [...new Set([...attendanceRows.map((r) => r.created_by), ...spaRows.map((r) => r.created_by)].filter((id): id is number => id != null))];
    const [subscriptions, members, users] = await Promise.all([
      this.prisma.club_subscriptions.findMany({ where: { id: { in: subscriptionIds } }, select: { id: true, subscription_type: true } }),
      this.prisma.club_members.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, member_code: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }),
    ]);
    const subscriptionName = new Map(subscriptions.map((s) => [s.id, s.subscription_type]));
    const memberById = new Map(members.map((m) => [m.id, m]));
    const employeeName = new Map(users.map((u) => [u.user_id, u.name || u.username || null]));
    const attendanceById = new Map(attendanceRows.map((r) => [r.id, r]));
    const spaById = new Map(spaRows.map((r) => [r.id, r]));
    const enrollmentById = new Map(enrollmentRows.map((r) => [r.id, r]));

    type ReportRow = {
      key: string; source: 'a' | 's' | 'e'; id: number; memberId: number; memberCode: string; memberName: string;
      subscriptionName: string | null; branchId: number | null; attendanceDate: string; time: string | null;
      attendanceType: string; employeeName: string | null;
    };
    const data = keys.flatMap((key): ReportRow[] => {
      const id = Number(key.id);
      if (key.src === 'a') {
        const r = attendanceById.get(id);
        if (!r) return [];
        return [{
          key: `a-${r.id}`, source: 'a', id: r.id, memberId: r.member_id, memberCode: r.member_code, memberName: r.member_name,
          subscriptionName: r.subscription_type, branchId: r.branch_id, attendanceDate: r.attendance_date,
          time: cairoDateTime(r.check_in_time).time.slice(0, 5), attendanceType: r.attendance_type ?? 'normal',
          employeeName: r.created_by != null ? employeeName.get(r.created_by) ?? null : null,
        }];
      }
      if (key.src === 's') {
        const r = spaById.get(id);
        if (!r) return [];
        return [{
          key: `s-${r.id}`, source: 's', id: r.id, memberId: r.member_id, memberCode: r.member_code, memberName: r.member_name,
          subscriptionName: subscriptionName.get(r.subscription_id) ?? null, branchId: r.branch_id, attendanceDate: r.attendance_date,
          time: r.check_in_time.slice(0, 5), attendanceType: 'spa',
          employeeName: r.created_by != null ? employeeName.get(r.created_by) ?? null : null,
        }];
      }
      const r = enrollmentById.get(id);
      if (!r) return [];
      const member = memberById.get(r.member_id);
      return [{
        key: `e-${r.id}`, source: 'e', id: r.id, memberId: r.member_id, memberCode: member?.member_code ?? '', memberName: member?.name ?? '',
        subscriptionName: r.subscription_id != null ? subscriptionName.get(r.subscription_id) ?? null : null,
        branchId: r.class.branch_id, attendanceDate: r.class.class_date, time: r.attendance_time?.slice(0, 5) ?? null,
        attendanceType: 'class', employeeName: null,
      }];
    });

    return {
      ...paginated(data, Number(countRows[0]?.cnt ?? 0), q.page, q.pageSize),
      todayOnly,
      canDelete: isSystemAdmin(user),
    };
  }

  /** Admin-only removal of a report row; any consumed balance is returned to the subscription. */
  async deleteBarcodeAttendance(source: string, id: number, user: JwtUser) {
    assertSystemAdmin(user);
    if (source === 'a') {
      const row = await this.prisma.club_attendance.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('سجل الحضور غير موجود');
      await this.prisma.$transaction(async (tx) => {
        if (row.subscription_id != null && !row.is_grace_session) {
          if (row.attendance_type === 'class') {
            await tx.$executeRaw`UPDATE club_subscriptions SET sessions_used = sessions_used - 1
              WHERE id = ${row.subscription_id} AND is_linked_to_sessions = 1 AND sessions_used > 0`;
            await tx.club_class_enrollments.updateMany({
              where: { member_id: row.member_id, subscription_id: row.subscription_id, enrollment_date: row.attendance_date, booking_source: 'reception_auto', attendance_status: 'attended' },
              data: { attendance_status: 'cancelled' },
            });
          } else if (row.attendance_type === 'spa') {
            await tx.$executeRaw`UPDATE club_subscriptions SET spa_used = spa_used - 1 WHERE id = ${row.subscription_id} AND spa_used > 0`;
            await tx.club_spa_attendance.deleteMany({ where: { member_id: row.member_id, attendance_date: row.attendance_date, subscription_id: row.subscription_id } });
          } else if (row.attendance_type === 'inbody') {
            await tx.$executeRaw`UPDATE club_subscriptions SET inbody_used = inbody_used - 1 WHERE id = ${row.subscription_id} AND inbody_used > 0`;
          }
        }
        await tx.club_attendance.delete({ where: { id } });
      });
      await this.audit.log({ entityType: 'club_attendance', entityId: id, action: 'delete', actorUserId: user.sub, branchId: row.branch_id, before: this.mapRow(row) });
      return { deleted: true };
    }
    if (source === 's') {
      const row = await this.prisma.club_spa_attendance.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('سجل حضور السبا غير موجود');
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE club_subscriptions SET spa_used = spa_used - 1 WHERE id = ${row.subscription_id} AND spa_used > 0`;
        await tx.club_attendance.deleteMany({ where: { member_id: row.member_id, attendance_date: row.attendance_date, subscription_id: row.subscription_id, attendance_type: 'spa' } });
        await tx.club_spa_attendance.delete({ where: { id } });
      });
      await this.audit.log({ entityType: 'club_spa_attendance', entityId: id, action: 'delete', actorUserId: user.sub, branchId: row.branch_id ?? undefined, before: row });
      return { deleted: true };
    }
    if (source === 'e') {
      const row = await this.prisma.club_class_enrollments.findUnique({ where: { id }, include: { class: { select: { branch_id: true } } } });
      if (!row || row.attendance_status !== 'attended') throw new NotFoundException('سجل حضور الحصة غير موجود');
      await this.prisma.$transaction(async (tx) => {
        await tx.club_class_enrollments.update({ where: { id }, data: { attendance_status: 'cancelled' } });
        if (row.subscription_id != null) {
          await tx.$executeRaw`UPDATE club_subscriptions SET sessions_used = sessions_used - 1
            WHERE id = ${row.subscription_id} AND is_linked_to_sessions = 1 AND sessions_used > 0`;
        }
      });
      await this.audit.log({ entityType: 'club_class_enrollment', entityId: id, action: 'delete', actorUserId: user.sub, branchId: row.class.branch_id, before: row });
      return { deleted: true };
    }
    throw new BadRequestException('نوع السجل غير صالح');
  }

  /**
   * Per-day attendance summary: one row per (day, member) with how many times the member
   * entered that day and the total minutes spent. Powers the "daily history" view where the
   * doctor wants each day shown once ("دخل 3 مرات، إجمالي القعدة ساعتين").
   */
  async dailySummary(q: ListClubAttendanceDto, user?: JwtUser) {
    const conditions: Prisma.Sql[] = [];
    if (q.memberId)
      conditions.push(Prisma.sql`member_id = ${Number(q.memberId)}`);
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    if (scope !== null) {
      conditions.push(
        scope.length
          ? Prisma.sql`branch_id IN (${Prisma.join(scope)})`
          : Prisma.sql`branch_id = -1`,
      );
    }
    if (q.startDate)
      conditions.push(Prisma.sql`attendance_date >= ${q.startDate}`);
    if (q.endDate) conditions.push(Prisma.sql`attendance_date <= ${q.endDate}`);
    if (q.status && q.status !== "all")
      conditions.push(Prisma.sql`status = ${q.status}`);
    if (q.search?.trim()) {
      const s = `%${q.search.trim()}%`;
      conditions.push(
        Prisma.sql`(member_name LIKE ${s} OR member_code LIKE ${s})`,
      );
    }
    const whereSql = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
      : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          date: string;
          member_id: number;
          member_name: string;
          member_code: string;
          subscription_id: number | null;
          subscription_type: string | null;
          attendance_type: string;
          branch_id: number;
          entries: bigint;
          total_duration: bigint | number | null;
          first_check_in: Date | null;
          last_check_out: Date | null;
        }[]
      >(Prisma.sql`
        SELECT attendance_date AS date, member_id, member_name, member_code, branch_id,
               subscription_id, subscription_type, attendance_type,
               COUNT(*) AS entries,
               COALESCE(SUM(duration), 0) AS total_duration,
               MIN(check_in_time) AS first_check_in,
               MAX(check_out_time) AS last_check_out
        FROM club_attendance
        ${whereSql}
        GROUP BY attendance_date, member_id, member_name, member_code, branch_id, subscription_id, subscription_type, attendance_type
        ORDER BY attendance_date DESC, member_name ASC
        LIMIT ${q.take} OFFSET ${q.skip}
      `),
      this.prisma.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT 1 FROM club_attendance
          ${whereSql}
          GROUP BY attendance_date, member_id, branch_id, subscription_id, attendance_type
        ) grp
      `),
    ]);

    const total = Number(countRows[0]?.cnt ?? 0);
    const data = rows.map((r) => ({
      date: r.date,
      memberId: r.member_id,
      memberName: r.member_name,
      memberCode: r.member_code,
      subscriptionId: r.subscription_id,
      subscriptionType: r.subscription_type,
      attendanceType: r.attendance_type ?? 'normal',
      branchId: r.branch_id,
      entries: Number(r.entries),
      totalDuration: Number(r.total_duration ?? 0),
      firstCheckIn: r.first_check_in,
      lastCheckOut: r.last_check_out,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async statistics(
    query: { branch?: string; startDate?: string; endDate?: string },
    user?: JwtUser,
  ) {
    const and: Prisma.club_attendanceWhereInput[] = [];
    const scope = this.attendanceBranchIds(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (query.startDate && query.endDate) {
      and.push({
        attendance_date: { gte: query.startDate, lte: query.endDate },
      });
    } else if (query.startDate) {
      and.push({ attendance_date: { gte: query.startDate } });
    } else if (query.endDate) {
      and.push({ attendance_date: { lte: query.endDate } });
    }
    const where: Prisma.club_attendanceWhereInput = and.length
      ? { AND: and }
      : {};

    const today = localDateString();

    const historyConditions: Prisma.Sql[] = [
      Prisma.sql`attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    ];
    if (scope !== null)
      historyConditions.push(Prisma.sql`branch_id IN (${Prisma.join(scope)})`);
    const historyWhere = Prisma.sql`WHERE ${Prisma.join(historyConditions, " AND ")}`;

    const [
      totalRecords,
      todayCheckIns,
      todayCheckOuts,
      activeCheckIns,
      membersByDate,
    ] = await Promise.all([
      this.prisma.club_attendance.count({ where }),
      this.prisma.club_attendance.count({
        where: { ...where, attendance_date: today },
      }),
      this.prisma.club_attendance.count({
        where: { ...where, attendance_date: today, status: "checked_out" },
      }),
      this.prisma.club_attendance.count({
        where: { ...where, status: "checked_in" },
      }),
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
          SELECT attendance_date AS date, COUNT(DISTINCT member_id) AS count
          FROM club_attendance
          ${historyWhere}
          GROUP BY attendance_date
          ORDER BY attendance_date DESC
        `,
    ]);

    return {
      totalRecords,
      todayCheckIns,
      todayCheckOuts,
      activeCheckIns,
      membersByDate: membersByDate.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }
}
