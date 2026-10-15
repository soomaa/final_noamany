import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ClubAttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { JwtUser } from '../../common/types/jwt-user';
import { isCloser, pickNearestSlot, slotProximity } from './nearest-class-slot';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { WebhookService } from '../webhooks/webhook.service';
import { localDateString } from './club-member.utils';
import {
  assignLegacyAttendanceToSubscriptions,
  buildMemberProfileSummary,
} from './club-member-profile-summary';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';
import { SubscriptionUtilizationDto } from './dto/subscription-utilization.dto';
import { ClubLockersService } from '../club-lockers/club-lockers.service';
import { ClubMembersService } from './club-members.service';
import { recordPrivateAttendanceCommission } from '../club-subscriptions/private-attendance.util';
import {
  ClubSubscriptionLifecycleService,
  RenewalPromotionResult,
} from '../club-subscriptions/club-subscription-lifecycle.service';

const EGYPT_TIME_ZONE = 'Africa/Cairo';

/** Repeat presses of check-in inside this window are treated as the same arrival. */
const CHECK_IN_COOLDOWN_MS = 2 * 60 * 1000;

/**
 * A visit nobody closed is capped at this length rather than running until the
 * hourly sweep notices it, which used to stamp 8–16 hour visits onto the record.
 */
const AUTO_CHECKOUT_CAP_MINUTES = 120;

function rateBucket(rate: number): 'high' | 'medium' | 'low' {
  if (rate >= 75) return 'high';
  if (rate >= 40) return 'medium';
  return 'low';
}

/**
 * How far from a scheduled class a walk-in still counts as being here for it. Wider than a
 * class window so arriving early or leaving late still lands on the right class, narrow enough
 * that a morning visit is never booked into an evening class.
 */
const CLASS_MATCH_WINDOW_MINUTES = 120;

/** Everything the reception screen needs to render the class chip. */
const SPECIAL_CLASS_INCLUDE = {
  trainer: { select: { id: true, name: true, color: true } },
  hall: { select: { name: true } },
  class_type: { select: { id: true, name: true, color: true } },
} as const;

function cairoDateTime(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}:${part('second')}`,
  };
}

@Injectable()
export class ClubAttendanceService {
  private readonly entryAlertLog = new Logger(ClubAttendanceService.name);

  async reportEntryAlert(input: { memberId: number; branchId: number; message: string; severity: 'block' | 'warn'; source: 'gate' | 'reception' }) {
    try {
      // Persist once per member/reason in the repeat-scan window; this keeps reception readable.
      const recent = await this.prisma.club_entry_alerts.findFirst({
        where: { member_id: input.memberId, branch_id: input.branchId, message: input.message,
          created_at: { gte: new Date(Date.now() - 120_000) } }, select: { id: true },
      });
      if (!recent) await this.prisma.club_entry_alerts.create({ data: {
        member_id: input.memberId, branch_id: input.branchId, message: input.message,
        severity: input.severity, source: input.source,
      } });
    } catch (error) {
      // Notification storage cannot turn a business refusal into a gate/server error.
      this.entryAlertLog.error('Could not persist reception entry alert', error instanceof Error ? error.stack : undefined);
    }
  }

  async listEntryAlerts(user: JwtUser, branchId?: string) {
    const branches = this.attendanceBranchIds(user, branchId);
    const rows = await this.prisma.club_entry_alerts.findMany({
      where: { ...(branches ? { branch_id: { in: branches } } : {}),
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { id: 'desc' }, take: 10,
    });
    const members = await this.prisma.club_members.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.member_id))] }, is_deleted: false },
      select: { id: true, name: true, member_code: true },
    });
    const byId = new Map(members.map((m) => [m.id, m]));
    return rows.map((row) => ({ id: row.id, memberId: row.member_id,
      memberName: byId.get(row.member_id)?.name ?? 'عضو محذوف',
      memberCode: byId.get(row.member_id)?.member_code ?? '—',
      message: row.message, severity: row.severity, source: row.source, createdAt: row.created_at }));
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
    private readonly entitlement: EntitlementService,
    private readonly audit: BusinessAuditService,
    private readonly automation: AutomationEngineService,
    private readonly webhooks: WebhookService,
    private readonly permissions: PermissionEngineService,
    private readonly branchScope: BranchScopeService,
    @Optional() private readonly lifecycle?: ClubSubscriptionLifecycleService,
    @Optional() private readonly lockers?: ClubLockersService,
  ) {}

  /**
   * Attendance is a reception operation, so non-admin accounts are intentionally stricter than
   * generic reporting fan-out: they operate on their own login branch only. System admins may
   * select one branch or view all branches.
   */
  private attendanceBranchIds(
    user?: JwtUser,
    requested?: string | number | null,
  ): number[] | null {
    if (!user) return null;
    if (user.level === 1) return this.branchScope.resolveListFilter(user, requested ?? null);
    const ownBranchId = Number(user.branch ?? 0);
    if (!ownBranchId) return [];
    const requestedNumber =
      requested == null || requested === '' || requested === 'all'
        ? null
        : Number(requested);
    if (
      requestedNumber != null &&
      Number.isFinite(requestedNumber) &&
      requestedNumber !== ownBranchId
    ) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لحضور فرع آخر');
    }
    return [ownBranchId];
  }

  /**
   * The branch a typed / scanned code is looked up in: the desk's explicit branch, otherwise a
   * branch employee's own login branch. Only a system admin without a branch searches every
   * branch (and gets an error, not a guess, when the code matches members in several).
   */
  private lookupBranchId(user: JwtUser | undefined, requested?: number | null): number | undefined {
    if (requested != null) return requested;
    if (!user || user.level === 1) return undefined;
    return Number(user.branch ?? 0) || undefined;
  }

  private canOperateAttendanceBranch(user: JwtUser | undefined, branchId: number): boolean {
    if (!user || user.level === 1) return true;
    return Number(user.branch ?? 0) === Number(branchId);
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
    status: string;
    duration: number | null;
    notes: string | null;
    is_grace_session?: boolean;
    override_reason?: string | null;
    pending_subscription_choice?: boolean;
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
      status: row.status,
      duration: row.duration,
      notes: row.notes,
      isGraceSession: row.is_grace_session ?? false,
      pendingSubscriptionChoice: row.pending_subscription_choice ?? false,
      overrideReason: row.override_reason ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  /**
   * Special subscriptions are configured as weekly trainer slots. Materialize the slot the
   * member is here for so reception attendance does not depend on somebody manually
   * generating the week from the scheduling screen first. A member who arrives early or a
   * little late still gets the class they came for — the nearest one on the day wins.
   */
  private weeklySlotsFor(classTypeId: number, branchId: number, date: string) {
    return this.prisma.club_trainer_schedule_slots.findMany({
      where: {
        class_type_id: classTypeId,
        branch_id: branchId,
        weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
        is_active: true,
        trainer: { is_active: true, is_deleted: false },
        class_type: { is_active: true, is_deleted: false },
      },
      include: { class_type: { select: { name: true, single_session_price: true } } },
      orderBy: [{ start_time: 'asc' }, { id: 'asc' }],
    });
  }

  private async materializeSlotClass(
    slot: Prisma.club_trainer_schedule_slotsGetPayload<{
      include: { class_type: { select: { name: true; single_session_price: true } } };
    }>,
    classTypeId: number,
    date: string,
  ) {
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
          include: SPECIAL_CLASS_INCLUDE,
          orderBy: { id: 'asc' },
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
            status: 'scheduled',
            audience: slot.audience,
          },
          include: SPECIAL_CLASS_INCLUDE,
        });
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${lockKey})`;
      }
    });
  }

  /**
   * The class a scheduled-class subscription is being used for right now. Candidates are the
   * day's already-created classes plus the weekly slots nobody has materialized yet; the
   * nearest of the two wins, so an early or slightly late walk-in still lands on the right one.
   */
  private async resolveSpecialClass(classTypeId: number, branchId: number, date: string, time: string) {
    const [sameDay, slots] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          class_type_id: classTypeId,
          branch_id: branchId,
          class_date: date,
          status: { not: 'cancelled' },
          is_active: true,
          is_deleted: false,
        },
        include: SPECIAL_CLASS_INCLUDE,
      }),
      this.weeklySlotsFor(classTypeId, branchId, date),
    ]);
    const nearestClass = pickNearestSlot(
      sameDay.map((row) => ({ row, startTime: row.start_time, endTime: row.end_time })),
      time,
      CLASS_MATCH_WINDOW_MINUTES,
    );
    const materialized = new Set(sameDay.map((row) => row.trainer_schedule_slot_id).filter(Boolean));
    const nearestSlot = pickNearestSlot(
      slots
        .filter((row) => !materialized.has(row.id))
        .map((row) => ({ row, startTime: row.start_time, endTime: row.end_time })),
      time,
      CLASS_MATCH_WINDOW_MINUTES,
    );
    if (nearestClass && (!nearestSlot || !isCloser(nearestSlot, nearestClass))) return nearestClass.row;
    if (nearestSlot) return this.materializeSlotClass(nearestSlot.row, classTypeId, date);
    return null;
  }

  /**
   * Reception preview: which scheduled class this member is about to be checked into, who is
   * taking it, and which captains may take it instead. Materializes the class so the captain
   * can be swapped before anybody is checked in.
   */
  async nextScheduledClass(
    query: { memberId?: number; memberCode?: string; subscriptionId?: number; branchId?: number },
    user?: JwtUser,
    occurredAt?: Date,
  ) {
    const member = await this.members.resolveByIdOrCode(
      query.memberId,
      query.memberCode,
      this.lookupBranchId(user, query.branchId),
    );
    const branchId = query.branchId ?? member.branch_id;
    if (!this.canOperateAttendanceBranch(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية عرض حضور هذا الفرع');
    }
    const entitlement = await this.entitlement.validate({
      memberId: member.id,
      branchId,
      subscriptionId: query.subscriptionId,
      at: occurredAt,
    });
    const classTypeId = entitlement.activeSubscription?.specialClassTypeId ?? null;
    if (!classTypeId) return { classTypeId: null, class: null, eligibleTrainers: [] };

    const localNow = cairoDateTime(occurredAt ?? new Date());
    const [specialClass, eligibleTrainers] = await Promise.all([
      this.resolveSpecialClass(classTypeId, branchId, localNow.date, localNow.time),
      this.prisma.club_class_type_trainers.findMany({
        where: { class_type_id: classTypeId, trainer: { is_active: true, is_deleted: false } },
        select: { trainer: { select: { id: true, name: true, color: true } } },
        orderBy: { trainer_id: 'asc' },
      }),
    ]);
    return {
      classTypeId,
      class: specialClass ? this.mapSpecialClass(specialClass, localNow.time) : null,
      eligibleTrainers: eligibleTrainers.map((row) => row.trainer),
    };
  }

  private mapSpecialClass(
    row: Prisma.club_classesGetPayload<{ include: typeof SPECIAL_CLASS_INCLUDE }>,
    now?: string,
  ) {
    return {
      classId: row.id,
      className: row.class_name,
      classColor: row.class_type?.color ?? null,
      trainerId: row.trainer.id,
      trainerName: row.trainer.name,
      trainerColor: row.trainer.color ?? null,
      hallName: row.hall?.name ?? null,
      startTime: row.start_time,
      endTime: row.end_time,
      position: now ? slotProximity({ startTime: row.start_time, endTime: row.end_time }, now).position : null,
    };
  }

  /**
   * Swap the captain on a materialized class — someone covered the shift. The class row owns
   * the trainer, so this also moves the class commission to whoever actually taught it.
   */
  async setScheduledClassTrainer(classId: number, trainerId: number, user?: JwtUser) {
    const cls = await this.prisma.club_classes.findFirst({
      where: { id: classId, is_deleted: false },
      include: SPECIAL_CLASS_INCLUDE,
    });
    if (!cls) throw new NotFoundException('الحصة غير موجودة');
    return this.mapSpecialClass(await this.reassignClassTrainer(cls, trainerId, user));
  }

  private async reassignClassTrainer(
    cls: Prisma.club_classesGetPayload<{ include: typeof SPECIAL_CLASS_INCLUDE }>,
    trainerId: number,
    user?: JwtUser,
  ) {
    if (!this.canOperateAttendanceBranch(user, cls.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية تعديل حصة في هذا الفرع');
    }
    if (cls.trainer_id === trainerId) return cls;
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_active: true, is_deleted: false },
      select: { id: true, name: true },
    });
    if (!trainer) throw new BadRequestException('المدرب غير موجود أو غير مفعّل');

    const updated = await this.prisma.club_classes.update({
      where: { id: cls.id },
      data: { trainer_id: trainerId },
      include: SPECIAL_CLASS_INCLUDE,
    });
    await this.audit.log({
      entityType: 'club_class',
      entityId: cls.id,
      action: 'class_trainer_reassigned',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: cls.branch_id,
      before: { trainerId: cls.trainer_id, trainerName: cls.trainer.name },
      after: { trainerId: trainer.id, trainerName: trainer.name },
    });
    return updated;
  }

  private async assertNotAttendedTx(tx: Prisma.TransactionClient, classId: number, memberId: number) {
    const alreadyAttended = await tx.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (alreadyAttended?.attendance_status === 'attended') {
      throw new BadRequestException('تم تسجيل حضور العضو في هذه الحصة بالفعل');
    }
  }

  /**
   * Takes one session atomically — the guarded UPDATE is what stops two concurrent
   * check-ins from both taking the last one — and activates a queued renewal when the
   * quota runs out.
   */
  private async consumeSessionTx(
    tx: Prisma.TransactionClient,
    subscriptionId: number,
    today: string,
  ): Promise<RenewalPromotionResult | null> {
    const consumed = await tx.$executeRaw`
            UPDATE club_subscriptions
            SET sessions_used = sessions_used + 1
            WHERE id = ${subscriptionId}
              AND is_linked_to_sessions = 1
              AND sessions_count IS NOT NULL
              AND sessions_used < sessions_count
            `;
    if (consumed !== 1) throw new BadRequestException('لا توجد حصص متبقية');
    const refreshed = await tx.club_subscriptions.findUnique({
      where: { id: subscriptionId },
      select: { sessions_count: true, sessions_used: true },
    });
    if (
      this.lifecycle &&
      refreshed?.sessions_count != null &&
      refreshed.sessions_used >= refreshed.sessions_count
    ) {
      return this.lifecycle.promoteAfterQuotaExhaustion(subscriptionId, today, tx);
    }
    return null;
  }

  /** Class enrolment and private-trainer commission that follow from a subscription visit. */
  private async recordSubscriptionUsageTx(
    tx: Prisma.TransactionClient,
    input: {
      attendanceId: number;
      memberId: number;
      subscriptionId: number;
      attendedClassId: number | null;
      recordPrivateCommission: boolean;
      date: string;
      time: string;
    },
  ) {
    if (input.attendedClassId != null) {
      const usage = {
        attendance_status: 'attended' as const,
        attendance_time: input.time,
        booking_source: 'reception_auto',
        subscription_id: input.subscriptionId,
      };
      await tx.club_class_enrollments.upsert({
        where: { class_id_member_id: { class_id: input.attendedClassId, member_id: input.memberId } },
        create: { class_id: input.attendedClassId, member_id: input.memberId, enrollment_date: input.date, ...usage },
        update: usage,
      });
    }
    if (input.recordPrivateCommission) {
      await recordPrivateAttendanceCommission(tx, {
        attendanceId: input.attendanceId,
        subscriptionId: input.subscriptionId,
        attendanceDate: input.date,
      });
    }
  }

  /** The visit a repeat scan inside the check-in cooldown belongs to, if any. */
  async recentCheckIn(memberId: number, at: Date) {
    return this.prisma.club_attendance.findFirst({
      where: { member_id: memberId, check_in_time: { gt: new Date(at.getTime() - CHECK_IN_COOLDOWN_MS) } },
      orderBy: { check_in_time: 'desc' },
      select: { id: true },
    });
  }

  /** Whether a special-class subscription could be used right now (a class starts soon). */
  async hasClassForSubscriptionAt(classTypeId: number, branchId: number, at: Date) {
    const local = cairoDateTime(at);
    return (await this.resolveSpecialClass(classTypeId, branchId, local.date, local.time)) != null;
  }

  /**
   * Gate entry of a member with several usable subscriptions. Nobody stands at the gate to
   * ask which one, so the visit is recorded straight away — the door must not wait — and
   * flagged; no session is taken until reception picks the subscription.
   */
  async recordPendingGateEntry(input: { memberId: number; branchId: number; occurredAt: Date; notes: string }) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: input.memberId, is_deleted: false },
      select: { id: true, member_code: true, name: true, branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (member.branch_id !== input.branchId) {
      throw new ForbiddenException('لا يمكن تسجيل حضور عضو تابع لفرع آخر');
    }
    const today = cairoDateTime(input.occurredAt).date;
    const row = await this.prisma.$transaction(async (tx) => {
      const open = await tx.club_attendance.findFirst({
        where: { member_id: member.id, attendance_date: today, status: 'checked_in' },
      });
      if (open) {
        await tx.club_attendance.update({
          where: { id: open.id },
          data: {
            check_out_time: input.occurredAt,
            status: 'checked_out',
            duration: Math.floor((input.occurredAt.getTime() - open.check_in_time.getTime()) / 60000),
            pending_subscription_choice: false,
          },
        });
      }
      return tx.club_attendance.create({
        data: {
          member_id: member.id,
          member_code: member.member_code,
          member_name: member.name,
          branch_id: input.branchId,
          attendance_date: today,
          check_in_time: input.occurredAt,
          status: 'checked_in',
          notes: input.notes,
          pending_subscription_choice: true,
        },
      });
    });
    await this.audit.log({
      entityType: 'club_attendance',
      entityId: row.id,
      action: 'check_in',
      branchId: input.branchId,
      after: this.mapRow(row),
    });
    void this.automation.emit('member_checked_in', { memberId: member.id, branchId: input.branchId, memberName: member.name });
    void this.webhooks.dispatch('member_checked_in', {
      memberId: member.id,
      memberCode: member.member_code,
      memberName: member.name,
      branchId: input.branchId,
      attendanceId: row.id,
      checkInTime: row.check_in_time,
    });
    return { attendance: this.mapRow(row) };
  }

  /** Gate entries still waiting for reception to pick a subscription, with the choices. */
  async listPendingGateEntries(user?: JwtUser, branchId?: string) {
    const branches = this.attendanceBranchIds(user, branchId);
    if (branches && branches.length === 0) return [];
    const rows = await this.prisma.club_attendance.findMany({
      where: {
        pending_subscription_choice: true,
        status: 'checked_in',
        check_in_time: { gt: new Date(Date.now() - 3 * 24 * 60 * 60_000) },
        ...(branches ? { branch_id: { in: branches } } : {}),
      },
      orderBy: { check_in_time: 'desc' },
      take: 50,
    });
    const result: Array<ReturnType<ClubAttendanceService['mapRow']> & { subscriptions: unknown[] }> = [];
    for (const row of rows) {
      const options = await this.entitlement.usableSubscriptions({
        memberId: row.member_id,
        branchId: row.branch_id,
        at: row.check_in_time,
      });
      result.push({
        ...this.mapRow(row),
        subscriptions: options
          .filter((option) => option.activeSubscription)
          .map((option) => ({
            id: option.activeSubscription!.id,
            type: option.activeSubscription!.subscriptionType,
            endDate: option.activeSubscription!.endDate,
            isLinkedToSessions: option.activeSubscription!.isLinkedToSessions,
            sessionsRemaining: option.activeSubscription!.sessionsRemaining,
            allowed: option.allowed,
            reasons: option.reasons.map((reason) => reason.messageAr),
          })),
      });
    }
    return result;
  }

  /**
   * Reception's pick for a pending gate entry. Applies the subscription exactly as a
   * check-in on it would have at the moment of entry — session, class, trainer commission.
   * The pending flag is claimed inside the transaction so two receptionists cannot both
   * take a session for the same visit.
   */
  async resolvePendingSubscription(attendanceId: number, subscriptionId: number, user?: JwtUser) {
    const row = await this.prisma.club_attendance.findUnique({ where: { id: attendanceId } });
    if (!row) throw new NotFoundException('سجل الحضور غير موجود');
    if (!row.pending_subscription_choice) throw new BadRequestException('تم تحديد الاشتراك لهذا الدخول بالفعل');
    if (!this.canOperateAttendanceBranch(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل حضور في هذا الفرع');
    }
    const subscription = await this.prisma.club_subscriptions.findUnique({
      where: { id: subscriptionId },
      select: { member_id: true, branch_id: true },
    });
    if (!subscription || subscription.member_id !== row.member_id) {
      throw new BadRequestException('الاشتراك غير موجود لهذا العضو');
    }
    if (subscription.branch_id !== row.branch_id) {
      throw new ForbiddenException('لا يمكن استخدام اشتراك تابع لفرع آخر');
    }
    const entitlement = await this.entitlement.validate({
      memberId: row.member_id,
      branchId: row.branch_id,
      subscriptionId,
      at: row.check_in_time,
    });
    if (!entitlement.allowed || !entitlement.activeSubscription) {
      throw new BadRequestException({
        message: entitlement.reasons.map((reason) => reason.messageAr).join('، ') || 'لا يمكن استخدام هذا الاشتراك',
        entitlement,
      });
    }
    const chosenSub = entitlement.activeSubscription;
    const local = cairoDateTime(row.check_in_time);
    const attendedClass = chosenSub.specialClassTypeId
      ? await this.resolveSpecialClass(chosenSub.specialClassTypeId, row.branch_id, local.date, local.time)
      : null;
    if (chosenSub.specialClassTypeId && !attendedClass) {
      throw new BadRequestException('لا توجد حصة مجدولة لهذا الاشتراك وقت الدخول');
    }
    const privatePackage = await this.prisma.club_subscriptions.findUnique({
      where: { id: chosenSub.id },
      select: { private_package_id: true },
    });
    const isPrivate = privatePackage?.private_package_id != null;

    let renewalPromotion: RenewalPromotionResult | null = null;
    const updated = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${row.member_id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${chosenSub.id} FOR UPDATE`;
        const live = await tx.club_subscriptions.findUnique({ where: { id: chosenSub.id }, include: { freezes: { where: { is_active: true } } } });
        if (!live || live.member_id !== row.member_id || live.branch_id !== row.branch_id || live.status === 'frozen' || live.renewal_hold || live.freezes.length) {
          throw new BadRequestException('حالة الاشتراك اتغيّرت أو تم تجميده؛ حدّث الصفحة وحاول تاني');
        }
        const claimed = await tx.club_attendance.updateMany({
          where: { id: row.id, pending_subscription_choice: true, status: 'checked_in' },
          data: {
            pending_subscription_choice: false,
            subscription_id: chosenSub.id,
            subscription_type: chosenSub.subscriptionType ?? null,
          },
        });
        if (claimed.count !== 1) throw new BadRequestException('تم تحديد الاشتراك لهذا الدخول بالفعل');
        if (attendedClass) await this.assertNotAttendedTx(tx, attendedClass.id, row.member_id);
        // A gate entry is a real visit, so it takes a session like any gate check-in.
        if (chosenSub.isLinkedToSessions) {
          renewalPromotion = await this.consumeSessionTx(tx, chosenSub.id, local.date);
        }
        await this.recordSubscriptionUsageTx(tx, {
          attendanceId: row.id,
          memberId: row.member_id,
          subscriptionId: chosenSub.id,
          attendedClassId: attendedClass?.id ?? null,
          recordPrivateCommission: isPrivate,
          date: local.date,
          time: local.time,
        });
        return tx.club_attendance.findUniqueOrThrow({ where: { id: row.id } });
      },
      { maxWait: 10000, timeout: 15000 },
    );

    await this.audit.log({
      entityType: 'club_attendance',
      entityId: row.id,
      action: 'check_in.subscription_selected',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: row.branch_id,
      before: this.mapRow(row),
      after: this.mapRow(updated),
    });
    const promotion = renewalPromotion as RenewalPromotionResult | null;
    if (promotion?.activatedSubscriptionId) {
      await this.lifecycle?.syncActivatedMember(promotion.activatedSubscriptionId);
    }
    return {
      attendance: this.mapRow(updated),
      subscription: {
        id: chosenSub.id,
        type: chosenSub.subscriptionType,
        isLinkedToSessions: chosenSub.isLinkedToSessions,
        sessionsRemaining: chosenSub.isLinkedToSessions ? Math.max(0, (chosenSub.sessionsRemaining ?? 0) - 1) : null,
        endDate: chosenSub.endDate,
      },
    };
  }

  /** Reception reviewed a gate arrival and intentionally keeps it without a subscription. */
  async dismissPendingGateEntry(attendanceId: number, user?: JwtUser) {
    const row = await this.prisma.club_attendance.findUnique({ where: { id: attendanceId } });
    if (!row) throw new NotFoundException('سجل الحضور غير موجود');
    if (!this.canOperateAttendanceBranch(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل حضور في هذا الفرع');
    }
    if (!row.pending_subscription_choice) return { ok: true, alreadyResolved: true };

    const claimed = await this.prisma.club_attendance.updateMany({
      where: { id: attendanceId, pending_subscription_choice: true, status: 'checked_in' },
      data: { pending_subscription_choice: false },
    });
    if (claimed.count !== 1) return { ok: true, alreadyResolved: true };

    const updated = await this.prisma.club_attendance.findUniqueOrThrow({ where: { id: attendanceId } });
    await this.audit.log({
      entityType: 'club_attendance',
      entityId: row.id,
      action: 'check_in.pending_dismissed',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: row.branch_id,
      before: this.mapRow(row),
      after: this.mapRow(updated),
    });
    return { ok: true };
  }

  async checkIn(dto: CheckInDto, user?: JwtUser, occurredAt?: Date) {
    const userId = user?.sub;
    const member = await this.members.resolveByIdOrCode(
      dto.memberId,
      dto.memberCode,
      this.lookupBranchId(user, dto.branchId),
    );
    const branchId = dto.branchId ?? member.branch_id;
    if (!this.canOperateAttendanceBranch(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل حضور في هذا الفرع');
    }
    if (member.branch_id !== branchId) {
      throw new ForbiddenException('لا يمكن تسجيل حضور عضو تابع لفرع آخر');
    }

    if (dto.subscriptionId != null) {
      const selectedSubscription = await this.prisma.club_subscriptions.findUnique({
        where: { id: dto.subscriptionId },
        select: { member_id: true, branch_id: true },
      });
      if (!selectedSubscription || selectedSubscription.member_id !== member.id) {
        throw new BadRequestException('الاشتراك غير موجود لهذا العضو');
      }
      if (selectedSubscription.branch_id !== branchId) {
        throw new ForbiddenException('لا يمكن استخدام اشتراك تابع لفرع آخر');
      }
    }

    const entitlement = await this.entitlement.validate({
      memberId: member.id,
      branchId,
      subscriptionId: dto.subscriptionId,
      at: occurredAt,
    });

    const entryMessages = entitlement.allowed ? entitlement.warnings : entitlement.reasons;
    if (entryMessages.length) await this.reportEntryAlert({ memberId: member.id, branchId,
      message: entryMessages.map((reason) => reason.messageAr).join('، '),
      severity: entitlement.allowed ? 'warn' : 'block', source: 'reception' });
    if (!entitlement.allowed && dto.force && entitlement.reasons.some((reason) =>
      ['no_active_subscription', 'subscription_not_active', 'outstanding_balance', 'subscription_frozen'].includes(reason.code))) {
      throw new BadRequestException({ message: entryMessages.map((reason) => reason.messageAr).join('، '), entitlement });
    }

    if (!entitlement.allowed && !dto.force) {
      throw new BadRequestException({
        message: entitlement.reasons.map((reason) => reason.messageAr).join('، ') || 'لا يمكن تسجيل الدخول — تحقق من الاشتراك',
        entitlement,
      });
    }

    if (!entitlement.allowed && dto.force) {
      if (entitlement.reasons.some((reason) => reason.code === 'member_blocked')) {
        throw new ForbiddenException('العضو محظور ولا يمكن تجاوز الحظر من شاشة الحضور');
      }
      if (entitlement.allowGraceSessions !== true) {
        throw new ForbiddenException('جلسات السماح غير مفعّلة من سياسات الجيم');
      }
      if (!dto.overrideReason?.trim()) {
        throw new BadRequestException('يجب إدخال سبب التجاوز عند تسجيل الدخول بالقوة');
      }
      if (!userId) {
        throw new ForbiddenException('لا يمكن تنفيذ تجاوز الحضور بدون مستخدم مصرح له');
      }
      // Overriding an expired/outstanding entitlement is an approval, not a normal check-in.
      const mayApprove = await this.permissions.canAny(userId, [
        'club.reception:approve',
        'club.members.attendance:approve',
      ]);
      if (!mayApprove) {
        throw new ForbiddenException('لا تملك صلاحية السماح بالدخول رغم رفض الاشتراك');
      }
      await this.audit.log({
        entityType: 'club_member',
        entityId: member.id,
        action: 'check_in.override',
        actorUserId: userId,
        branchId,
        reason: dto.overrideReason.trim(),
        after: {
          graceSession: true,
          overrideReason: dto.overrideReason.trim(),
          subscriptionId:
            dto.subscriptionId ?? entitlement.activeSubscription?.id ?? entitlement.latestSubscription?.id ?? null,
          subscriptionEndDate:
            entitlement.activeSubscription?.endDate ?? entitlement.latestSubscription?.endDate ?? null,
          subscriptionType:
            entitlement.activeSubscription?.subscriptionType ??
            entitlement.latestSubscription?.subscriptionType ??
            null,
          entitlement,
        },
      });
    }

    // Reception staff re-press check-in when they miss the confirmation, and each press
    // used to close the previous visit at zero minutes and open a fresh one. Real repeat
    // visits in the same day are never closer than ten minutes apart, so a short window
    // removes the duplicates without swallowing a genuine second entry.
    //
    // This runs after entitlement so a blocked or expired member still hears the real
    // reason rather than a misleading "already checked in", but before the transaction
    // so a duplicate press never consumes a session.
    const recent = await this.prisma.club_attendance.findFirst({
      where: {
        member_id: member.id,
        check_in_time: {
          gt: new Date((occurredAt ?? new Date()).getTime() - CHECK_IN_COOLDOWN_MS),
          lte: occurredAt ?? new Date(),
        },
      },
      orderBy: { check_in_time: 'desc' },
    });
    if (recent) {
      const agoMinutes = Math.floor(
        ((occurredAt ?? new Date()).getTime() - recent.check_in_time.getTime()) / 60000,
      );
      throw new BadRequestException(
        agoMinutes < 1
          ? 'تم تسجيل دخول العضو بالفعل منذ لحظات'
          : `تم تسجيل دخول العضو بالفعل منذ ${agoMinutes} دقيقة`,
      );
    }

    // Prefer the evaluated subscription; on grace with no pick, attach the latest expired one.
    const isGrace = !entitlement.allowed && !!dto.force;
    let chosenSub = entitlement.activeSubscription;
    if (!chosenSub && isGrace && entitlement.latestSubscription) {
      chosenSub = entitlement.latestSubscription;
    }
    const now = occurredAt ?? new Date();
    const localNow = cairoDateTime(now);
    const today = localNow.date;
    const specialClass =
      !isGrace && chosenSub?.specialClassTypeId
        ? await this.resolveSpecialClass(chosenSub.specialClassTypeId, branchId, today, localNow.time)
        : null;

    const privatePackage = chosenSub && !isGrace
      ? await this.prisma.club_subscriptions.findUnique({
          where: { id: chosenSub.id },
          select: { private_package_id: true },
        })
      : null;
    const isPrivate = privatePackage?.private_package_id != null;

    if (chosenSub?.specialClassTypeId && !specialClass && !isGrace) {
      throw new BadRequestException('لا توجد حصة مجدولة لهذا الاشتراك خلال ساعتين من الآن');
    }
    // Reception may have picked a stand-in captain on the check-in screen.
    const attendedClass =
      specialClass && dto.classTrainerId
        ? await this.reassignClassTrainer(specialClass, dto.classTrainerId, user)
        : specialClass;

    const renewalPromotionHolder: { value: RenewalPromotionResult | null } = { value: null };
    const row = await this.prisma.$transaction(
      async (tx) => {
        // Serialize entry with other scans, freezes, renewals, and transfers for this member.
        await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${member.id} FOR UPDATE`;
        const duplicate = await tx.club_attendance.findFirst({
          where: { member_id: member.id, check_in_time: {
            gt: new Date(now.getTime() - CHECK_IN_COOLDOWN_MS), lte: now,
          } }, orderBy: { check_in_time: 'desc' },
        });
        if (duplicate) throw new BadRequestException('تم تسجيل دخول العضو بالفعل منذ لحظات');
        if (chosenSub) {
          await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${chosenSub.id} FOR UPDATE`;
          const live = await tx.club_subscriptions.findUnique({
            where: { id: chosenSub.id }, include: { freezes: { where: { is_active: true } } },
          });
          if (!live || live.member_id !== member.id || live.status === 'frozen' || live.renewal_hold || live.freezes.length) {
            throw new BadRequestException('حالة الاشتراك اتغيّرت أو تم تجميده؛ حدّث الصفحة وحاول تاني');
          }
        }
        const lockKey = attendedClass ? `special_att_${attendedClass.id}_${member.id}` : null;
        if (lockKey) await tx.$queryRaw`SELECT GET_LOCK(${lockKey}, 10)`;
        try {
          if (attendedClass) await this.assertNotAttendedTx(tx, attendedClass.id, member.id);

          // A member may use a monthly subscription and a class subscription on the same day.
          // Close only the open visit that belongs to the currently selected subscription.
          const existing = await tx.club_attendance.findFirst({
            where: {
              member_id: member.id,
              attendance_date: today,
              status: 'checked_in',
              ...(dto.subscriptionId != null ? { subscription_id: dto.subscriptionId } : {}),
            },
          });
          if (existing) {
            await tx.club_attendance.update({
              where: { id: existing.id },
              data: {
                check_out_time: now,
                status: 'checked_out',
                duration: Math.floor((now.getTime() - existing.check_in_time.getTime()) / 60000),
                pending_subscription_choice: false,
              },
            });
          }

          const unresolved = await tx.club_attendance.findMany({
            where: {
              member_id: member.id,
              attendance_date: today,
              status: 'checked_in',
              pending_subscription_choice: true,
            },
            select: { id: true, check_in_time: true },
          });
          for (const visit of unresolved) {
            await tx.club_attendance.update({
              where: { id: visit.id },
              data: {
                check_out_time: now,
                status: 'checked_out',
                duration: Math.floor((now.getTime() - visit.check_in_time.getTime()) / 60000),
                pending_subscription_choice: false,
              },
            });
          }

          if ((dto.consumeSession || attendedClass || isPrivate) && chosenSub?.isLinkedToSessions && !isGrace) {
            renewalPromotionHolder.value = await this.consumeSessionTx(tx, chosenSub.id, today);
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
              check_in_time: now,
              status: 'checked_in',
              notes: dto.notes || null,
              is_grace_session: isGrace,
              override_reason: isGrace ? dto.overrideReason!.trim().slice(0, 255) : null,
              created_by: userId,
            },
          });

          if (chosenSub) {
            await this.recordSubscriptionUsageTx(tx, {
              attendanceId: attendance.id,
              memberId: member.id,
              subscriptionId: chosenSub.id,
              attendedClassId: attendedClass?.id ?? null,
              recordPrivateCommission: isPrivate && !isGrace,
              date: today,
              time: localNow.time,
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
      entityType: 'club_attendance',
      entityId: row.id,
      action: 'check_in',
      actorUserId: userId,
      actorName: user?.name ?? undefined,
      branchId,
      after: this.mapRow(row),
    });

    const renewalPromotion = renewalPromotionHolder.value;
    if (renewalPromotion?.activatedSubscriptionId) {
      await this.lifecycle?.syncActivatedMember(renewalPromotion.activatedSubscriptionId);
      await this.audit.log({
        entityType: 'club_subscription',
        entityId: renewalPromotion.activatedSubscriptionId,
        action: 'subscription_renewal_activated_early',
        actorUserId: userId,
        actorName: user?.name ?? undefined,
        branchId,
        before: { exhaustedSubscriptionId: chosenSub?.id ?? null },
        after: renewalPromotion,
      });
    }

    void this.automation.emit('member_checked_in', {
      memberId: member.id,
      branchId,
      memberName: member.name,
    });

    void this.webhooks.dispatch('member_checked_in', {
      memberId: member.id,
      memberCode: member.member_code,
      memberName: member.name,
      branchId,
      attendanceId: row.id,
      checkInTime: row.check_in_time,
    });

    // Detail for the receptionist: which subscription was used and (for session packages)
    // the remaining sessions after this check-in consumed one.
    const consumedSession = Boolean((dto.consumeSession || attendedClass || isPrivate) && chosenSub?.isLinkedToSessions && !isGrace);
    const sessionsRemainingAfter = chosenSub?.isLinkedToSessions
      ? Math.max(0, (chosenSub.sessionsRemaining ?? 0) - (consumedSession ? 1 : 0))
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
            daysRemaining: chosenSub.isLinkedToSessions ? null : (chosenSub.daysRemaining ?? null),
            endDate: chosenSub.endDate,
            consumedSession,
          }
        : null,
      classAttendance: attendedClass ? this.mapSpecialClass(attendedClass, localNow.time) : null,
      overridden: Boolean(dto.force && !entitlement.allowed),
    };
  }

  async checkOut(dto: CheckOutDto, user?: JwtUser, occurredAt?: Date) {
    const today = cairoDateTime(occurredAt ?? new Date()).date;
    let row;

    if (dto.attendanceId) {
      row = await this.prisma.club_attendance.findUnique({
        where: { id: dto.attendanceId },
      });
    } else {
      const member = await this.members.resolveByIdOrCode(
        dto.memberId,
        dto.memberCode,
        dto.memberId ? undefined : this.lookupBranchId(user),
      );
      row = await this.prisma.club_attendance.findFirst({
        where: {
          member_id: member.id,
          attendance_date: today,
          status: 'checked_in',
        },
        orderBy: { check_in_time: 'desc' },
      });
    }

    if (!row) throw new NotFoundException('لا يوجد تسجيل دخول مفتوح لهذا العضو اليوم');
    if (!this.canOperateAttendanceBranch(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية تسجيل خروج في هذا الفرع');
    }
    if (row.status === 'checked_out') throw new BadRequestException('تم تسجيل الخروج مسبقاً');

    const checkOutTime = occurredAt ?? new Date();
    const duration = Math.floor((checkOutTime.getTime() - row.check_in_time.getTime()) / 60000);

    const updated = await this.prisma.club_attendance.update({
      where: { id: row.id },
      data: { check_out_time: checkOutTime, status: 'checked_out', duration, pending_subscription_choice: false },
    });

    const returnedLocker = this.lockers
      ? await this.lockers.releaseOpenForMember(updated.member_id, user?.sub)
      : null;

    await this.audit.log({
      entityType: 'club_attendance',
      entityId: updated.id,
      action: 'check_out',
      actorUserId: user?.sub,
      actorName: user?.name ?? undefined,
      branchId: updated.branch_id,
      after: { ...this.mapRow(updated), returnedLockerNumber: returnedLocker?.lockerNumber ?? null },
    });

    return { ...this.mapRow(updated), returnedLockerNumber: returnedLocker?.lockerNumber ?? null };
  }

  /** Auto check-out stale open visits (previous days or >8h same day). */
  async autoCheckoutStale() {
    const today = localDateString();
    const staleCutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const openRows = await this.prisma.club_attendance.findMany({
      where: {
        status: 'checked_in',
        OR: [{ attendance_date: { lt: today } }, { check_in_time: { lt: staleCutoff } }],
      },
    });
    let count = 0;
    for (const row of openRows) {
      // Stamping `now` recorded however long the sweep took to notice the open visit,
      // which is not a fact about the member. Cap it instead, and mark the row so
      // duration averages can tell an estimate apart from a real scan-out.
      const capped = new Date(row.check_in_time.getTime() + AUTO_CHECKOUT_CAP_MINUTES * 60000);
      const now = new Date();
      const checkOutTime = capped < now ? capped : now;
      const duration = Math.floor((checkOutTime.getTime() - row.check_in_time.getTime()) / 60000);
      await this.prisma.club_attendance.update({
        where: { id: row.id },
        data: { check_out_time: checkOutTime, status: 'auto_closed', duration, pending_subscription_choice: false },
      });
      if (this.lockers) await this.lockers.releaseOpenForMember(row.member_id);
      count++;
    }
    return { checkedOut: count };
  }

  async list(q: ListClubAttendanceDto, user?: JwtUser) {
    const and: Prisma.club_attendanceWhereInput[] = [];

    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.gender) and.push({ member: { is_deleted: false, gender: q.gender } });
    if (q.startDate && q.endDate) {
      and.push({ attendance_date: { gte: q.startDate, lte: q.endDate } });
    } else if (q.startDate) {
      and.push({ attendance_date: { gte: q.startDate } });
    } else if (q.endDate) {
      and.push({ attendance_date: { lte: q.endDate } });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status as ClubAttendanceStatus });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ member_name: { contains: s } }, { member_code: { contains: s } }],
      });
    }

    const where: Prisma.club_attendanceWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.club_attendance.findMany({
        where,
        orderBy: { check_in_time: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_attendance.count({ where }),
    ]);

    const mapped = rows.map((r) => this.mapRow(r));
    const lockerNumbers = this.lockers
      ? await this.lockers.openHandoffNumbers(mapped.map((row) => row.memberId))
      : new Map<number, string>();
    return paginated(
      mapped.map((row) => ({
        ...row,
        lockerNumber: row.status === 'checked_in' ? lockerNumbers.get(row.memberId) ?? null : null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async subscriptionUtilization(q: SubscriptionUtilizationDto, user?: JwtUser) {
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    const search = q.search?.trim();
    const where: Prisma.club_subscriptionsWhereInput = {
      member_id: { not: null },
      ...(scope !== null ? { branch_id: { in: scope } } : {}),
      member: { is: { is_deleted: false } },
      ...(search
        ? {
            OR: [
              { subscription_number: { contains: search } },
              { subscription_type: { contains: search } },
              { customer_name: { contains: search } },
              {
                member: {
                  is: {
                    OR: [
                      { name: { contains: search } },
                      { member_code: { contains: search } },
                      { phone: { contains: search } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where,
      select: {
        id: true,
        subscription_number: true,
        subscription_type: true,
        status: true,
        subscription_start_date: true,
        subscription_end_date: true,
        is_linked_to_sessions: true,
        sessions_count: true,
        sessions_used: true,
        branch_id: true,
        member: {
          select: {
            id: true,
            member_code: true,
            name: true,
            phone: true,
            profile_picture: true,
            branch_id: true,
          },
        },
      },
      orderBy: [{ subscription_end_date: 'asc' }, { id: 'desc' }],
    });

    const subscriptionIds = subscriptions.map((subscription) => subscription.id);
    const memberIds = [
      ...new Set(
        subscriptions.flatMap((subscription) =>
          subscription.member ? [subscription.member.id] : [],
        ),
      ),
    ];
    const earliestStartDate = subscriptions.reduce<string | null>(
      (earliest, subscription) =>
        !earliest || subscription.subscription_start_date < earliest
          ? subscription.subscription_start_date
          : earliest,
      null,
    );
    const latestEndDate = subscriptions.reduce<string | null>(
      (latest, subscription) =>
        !latest || subscription.subscription_end_date > latest
          ? subscription.subscription_end_date
          : latest,
      null,
    );
    const attendances = subscriptionIds.length
      ? await this.prisma.club_attendance.findMany({
          where: {
            OR: [
              { subscription_id: { in: subscriptionIds } },
              {
                subscription_id: null,
                member_id: { in: memberIds },
                ...(scope !== null ? { branch_id: { in: scope } } : {}),
                ...(earliestStartDate && latestEndDate
                  ? {
                      attendance_date: {
                        gte: earliestStartDate,
                        lte: latestEndDate,
                      },
                    }
                  : {}),
              },
            ],
          },
          select: {
            id: true,
            member_id: true,
            subscription_id: true,
            branch_id: true,
            attendance_date: true,
            check_in_time: true,
            check_out_time: true,
            duration: true,
            status: true,
          },
          orderBy: { check_in_time: 'desc' },
        })
      : [];
    const subscriptionsByMemberBranch = new Map<string, typeof subscriptions>();
    for (const subscription of subscriptions) {
      if (!subscription.member) continue;
      const key = `${subscription.member.id}:${subscription.branch_id}`;
      const rows = subscriptionsByMemberBranch.get(key) ?? [];
      rows.push(subscription);
      subscriptionsByMemberBranch.set(key, rows);
    }
    const attendancesByMemberBranch = new Map<string, typeof attendances>();
    for (const attendance of attendances) {
      const key = `${attendance.member_id}:${attendance.branch_id}`;
      const rows = attendancesByMemberBranch.get(key) ?? [];
      rows.push(attendance);
      attendancesByMemberBranch.set(key, rows);
    }
    const attendanceBySubscription = new Map<number, typeof attendances>();
    for (const [key, memberAttendances] of attendancesByMemberBranch) {
      const memberSubscriptions = subscriptionsByMemberBranch.get(key) ?? [];
      const resolvedAttendances = assignLegacyAttendanceToSubscriptions({
        subscriptions: memberSubscriptions,
        attendances: memberAttendances,
      });
      for (const attendance of resolvedAttendances) {
        if (attendance.subscription_id == null) continue;
        const rows = attendanceBySubscription.get(attendance.subscription_id) ?? [];
        rows.push(attendance as (typeof attendances)[number]);
        attendanceBySubscription.set(attendance.subscription_id, rows);
      }
    }

    const today = localDateString();
    const rows = subscriptions.flatMap((subscription) => {
      if (!subscription.member) return [];
      const summary = buildMemberProfileSummary({
        today,
        subscriptions: [subscription],
        attendances: attendanceBySubscription.get(subscription.id) ?? [],
        renewalSubscriptionIds: new Set<number>(),
        renewalCount: 0,
      }).subscriptions[0];
      if (!summary) return [];
      return [{
        subscriptionId: subscription.id,
        subscriptionNumber: summary.subscriptionNumber,
        subscriptionType: summary.subscriptionType,
        status: summary.status,
        startDate: summary.startDate,
        endDate: summary.endDate,
        totalDays: summary.totalDays,
        remainingDays: summary.remainingDays,
        isLinkedToSessions: summary.isLinkedToSessions,
        sessionsCount: summary.sessionsCount,
        sessionsUsed: summary.sessionsUsed,
        sessionsRemaining: summary.sessionsRemaining,
        attendanceDays: summary.attendanceDays,
        attendanceEntries: summary.attendanceEntries,
        attendanceRate: summary.attendanceRate,
        lastAttendanceDate: summary.lastAttendanceDate,
        branchId: subscription.branch_id,
        member: {
          id: subscription.member.id,
          memberCode: subscription.member.member_code,
          name: subscription.member.name,
          phone: subscription.member.phone,
          profilePicture: subscription.member.profile_picture,
          branchId: subscription.member.branch_id,
        },
      }];
    });
    const statusFiltered = q.status === 'all'
      ? rows
      : rows.filter((row) => row.status === q.status);
    const filtered = q.rateBucket && q.rateBucket !== 'all'
      ? statusFiltered.filter((row) => rateBucket(row.attendanceRate) === q.rateBucket)
      : statusFiltered;
    const sorted = q.sort === 'attendanceRate'
      ? [...filtered].sort((a, b) =>
          q.order === 'asc'
            ? a.attendanceRate - b.attendanceRate
            : b.attendanceRate - a.attendanceRate,
        )
      : filtered;
    const data = sorted.slice(q.skip, q.skip + q.take);

    return paginated(data, filtered.length, q.page, q.pageSize);
  }

  /**
   * Per-day attendance summary: one row per (day, member) with how many times the member
   * entered that day and the total minutes spent. Powers the "daily history" view where the
   * doctor wants each day shown once ("دخل 3 مرات، إجمالي القعدة ساعتين").
   */
  async dailySummary(q: ListClubAttendanceDto, user?: JwtUser) {
    const conditions: Prisma.Sql[] = [];
    if (q.memberId) conditions.push(Prisma.sql`member_id = ${Number(q.memberId)}`);
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    if (scope !== null) {
      conditions.push(
        scope.length
          ? Prisma.sql`branch_id IN (${Prisma.join(scope)})`
          : Prisma.sql`branch_id = -1`,
      );
    }
    if (q.gender) {
      conditions.push(
        Prisma.sql`member_id IN (SELECT id FROM club_members WHERE is_deleted = 0 AND gender = ${q.gender})`,
      );
    }
    if (q.startDate) conditions.push(Prisma.sql`attendance_date >= ${q.startDate}`);
    if (q.endDate) conditions.push(Prisma.sql`attendance_date <= ${q.endDate}`);
    if (q.status && q.status !== 'all') conditions.push(Prisma.sql`status = ${q.status}`);
    if (q.search?.trim()) {
      const s = `%${q.search.trim()}%`;
      conditions.push(Prisma.sql`(member_name LIKE ${s} OR member_code LIKE ${s})`);
    }
    const whereSql = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<
        {
          date: string;
          member_id: number;
          member_name: string;
          member_code: string;
          subscription_id: number | null;
          subscription_type: string | null;
          branch_id: number;
          entries: bigint;
          total_duration: bigint | number | null;
          first_check_in: Date | null;
          last_check_out: Date | null;
        }[]
      >(Prisma.sql`
        SELECT attendance_date AS date, member_id, member_name, member_code, branch_id,
               subscription_id, subscription_type,
               COUNT(*) AS entries,
               COALESCE(SUM(duration), 0) AS total_duration,
               MIN(check_in_time) AS first_check_in,
               MAX(check_out_time) AS last_check_out
        FROM club_attendance
        ${whereSql}
        GROUP BY attendance_date, member_id, member_name, member_code, branch_id, subscription_id, subscription_type
        ORDER BY attendance_date DESC, member_name ASC
        LIMIT ${q.take} OFFSET ${q.skip}
      `),
      this.prisma.$queryRaw<{ cnt: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS cnt FROM (
          SELECT 1 FROM club_attendance
          ${whereSql}
          GROUP BY attendance_date, member_id, branch_id, subscription_id
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
      branchId: r.branch_id,
      entries: Number(r.entries),
      totalDuration: Number(r.total_duration ?? 0),
      firstCheckIn: r.first_check_in,
      lastCheckOut: r.last_check_out,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async statistics(
    query: {
      branch?: string;
      startDate?: string;
      endDate?: string;
      gender?: 'male' | 'female';
    },
    user?: JwtUser,
  ) {
    const and: Prisma.club_attendanceWhereInput[] = [];
    const scope = this.attendanceBranchIds(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (query.gender) and.push({ member: { is_deleted: false, gender: query.gender } });
    if (query.startDate && query.endDate) {
      and.push({
        attendance_date: { gte: query.startDate, lte: query.endDate },
      });
    } else if (query.startDate) {
      and.push({ attendance_date: { gte: query.startDate } });
    } else if (query.endDate) {
      and.push({ attendance_date: { lte: query.endDate } });
    }
    const where: Prisma.club_attendanceWhereInput = and.length ? { AND: and } : {};

    const today = localDateString();

    const historyConditions: Prisma.Sql[] = [
      Prisma.sql`attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    ];
    if (scope !== null) {
      historyConditions.push(
        scope.length
          ? Prisma.sql`branch_id IN (${Prisma.join(scope)})`
          : Prisma.sql`branch_id = -1`,
      );
    }
    if (query.gender) {
      historyConditions.push(
        Prisma.sql`member_id IN (SELECT id FROM club_members WHERE is_deleted = 0 AND gender = ${query.gender})`,
      );
    }
    const historyWhere = Prisma.sql`WHERE ${Prisma.join(historyConditions, ' AND ')}`;

    const [totalRecords, todayCheckIns, todayCheckOuts, activeCheckIns, membersByDate] = await Promise.all([
      this.prisma.club_attendance.count({ where }),
      this.prisma.club_attendance.count({
        where: { ...where, attendance_date: today },
      }),
      this.prisma.club_attendance.count({
        // "Left today" covers both scan-outs and sweep-closed visits; the member is
        // gone either way, only our confidence in the timestamp differs.
        where: { ...where, attendance_date: today, status: { in: ['checked_out', 'auto_closed'] } },
      }),
      this.prisma.club_attendance.count({
        where: { ...where, status: 'checked_in' },
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
