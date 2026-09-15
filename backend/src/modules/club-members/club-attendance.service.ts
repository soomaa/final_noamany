import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { paginated } from "../../common/dto/list-result";
import { JwtUser } from "../../common/types/jwt-user";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";
import { BusinessAuditService } from "../gym-ops/business-audit.service";
import { EntitlementService } from "../gym-ops/entitlement.service";
import { AutomationEngineService } from "../gym-ops/automation-engine.service";
import { WebhookService } from "../webhooks/webhook.service";
import { localDateString } from "./club-member.utils";
import { CheckInDto, CheckOutDto } from "./dto/check-in.dto";
import { ListClubAttendanceDto } from "./dto/list-club-attendance.dto";
import { ClubMembersService } from "./club-members.service";
import { recordPrivateAttendanceCommission } from "../club-subscriptions/private-attendance.util";
import { expandClubReportBranchIds } from "./club-branch-groups";

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
  ) {}

  /**
   * Attendance writes remain locked to the operator's exact login branch. Read listings preserve
   * the legacy Tanta report group (main, Up, Down) when the login/selected branch is Tanta main.
   */
  private attendanceBranchIds(
    user?: JwtUser,
    requested?: string | number | null,
  ): number[] | null {
    if (!user) return [];
    if (user.level === 1)
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

  private canOperateAttendanceBranch(
    user: JwtUser | undefined,
    branchId: number,
  ): boolean {
    if (!user) return false;
    if (user.level === 1) return true;
    return Number(user.branch ?? 0) === Number(branchId);
  }

  private attendanceAudience(user?: JwtUser, requested?: string) {
    if (requested && requested !== "male" && requested !== "female") {
      throw new BadRequestException("القسم غير صحيح");
    }
    const locked = this.branchScope.memberGenderFilter(user);
    if (locked && requested && requested !== locked) {
      throw new BadRequestException("لا يمكن تغيير قسم البيانات المسموح به");
    }
    return locked ?? (requested as "male" | "female" | undefined);
  }

  private assertMemberAudience(
    user: JwtUser | undefined,
    member: { gender: string | null; is_deleted?: boolean },
  ) {
    if (member.is_deleted) throw new NotFoundException("العضو غير موجود");
    const audience = this.attendanceAudience(user);
    if (audience && member.gender !== audience) {
      throw new ForbiddenException("لا تملك صلاحية تسجيل حضور لهذا القسم");
    }
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

  async checkIn(dto: CheckInDto, user: JwtUser) {
    const userId = user.sub;
    const member = await this.members.resolveByIdOrCode(
      dto.memberId,
      dto.memberCode,
    );
    this.assertMemberAudience(user, member);
    const branchId = dto.branchId ?? member.branch_id;
    if (!this.canOperateAttendanceBranch(user, branchId)) {
      throw new ForbiddenException("لا تملك صلاحية تسجيل حضور في هذا الفرع");
    }
    if (member.branch_id !== branchId) {
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
      if (selectedSubscription.branch_id !== branchId) {
        throw new ForbiddenException("لا يمكن استخدام اشتراك تابع لفرع آخر");
      }
    }

    const entitlement = await this.entitlement.validate({
      memberId: member.id,
      branchId,
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
      !isGrace && chosenSub?.specialClassTypeId
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

    if (chosenSub?.specialClassTypeId && !specialClass && !isGrace) {
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

    if (chosenSub?.specialClassTypeId && !specialClass && !isGrace) {
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
            (dto.consumeSession || specialClass || isPrivate) &&
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
          if (isPrivate && chosenSub && !isGrace) {
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
      (dto.consumeSession || specialClass || isPrivate) &&
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
    let row: Prisma.club_attendanceGetPayload<{
      include: { member: { select: { gender: true; is_deleted: true } } };
    }> | null;

    if (dto.attendanceId) {
      row = await this.prisma.club_attendance.findUnique({
        where: { id: dto.attendanceId },
        include: { member: { select: { gender: true, is_deleted: true } } },
      });
    } else {
      const member = await this.members.resolveByIdOrCode(
        dto.memberId,
        dto.memberCode,
      );
      this.assertMemberAudience(user, member);
      row = await this.prisma.club_attendance.findFirst({
        where: {
          member_id: member.id,
          attendance_date: today,
          status: "checked_in",
        },
        include: { member: { select: { gender: true, is_deleted: true } } },
        orderBy: { check_in_time: "desc" },
      });
    }

    if (!row)
      throw new NotFoundException("لا يوجد تسجيل دخول مفتوح لهذا العضو اليوم");
    this.assertMemberAudience(user, row.member);
    if (!this.canOperateAttendanceBranch(user, row.branch_id)) {
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
    const audience = this.attendanceAudience(user, q.gender);

    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    const scope = this.attendanceBranchIds(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (audience) and.push({ member: { is_deleted: false, gender: audience } });
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

  /**
   * Per-day attendance summary: one row per (day, member) with how many times the member
   * entered that day and the total minutes spent. Powers the "daily history" view where the
   * doctor wants each day shown once ("دخل 3 مرات، إجمالي القعدة ساعتين").
   */
  async dailySummary(q: ListClubAttendanceDto, user?: JwtUser) {
    const conditions: Prisma.Sql[] = [];
    const audience = this.attendanceAudience(user, q.gender);
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
    if (audience) {
      conditions.push(Prisma.sql`member_id IN (
        SELECT id FROM club_members WHERE gender = ${audience} AND is_deleted = 0
      )`);
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
    query: { branch?: string; startDate?: string; endDate?: string; gender?: string },
    user?: JwtUser,
  ) {
    const and: Prisma.club_attendanceWhereInput[] = [];
    const audience = this.attendanceAudience(user, query.gender);
    const scope = this.attendanceBranchIds(user, query.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (audience) and.push({ member: { is_deleted: false, gender: audience } });
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
    if (scope !== null) {
      historyConditions.push(
        scope.length
          ? Prisma.sql`branch_id IN (${Prisma.join(scope)})`
          : Prisma.sql`branch_id = -1`,
      );
    }
    if (audience) {
      historyConditions.push(Prisma.sql`member_id IN (
        SELECT id FROM club_members WHERE gender = ${audience} AND is_deleted = 0
      )`);
    }
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
