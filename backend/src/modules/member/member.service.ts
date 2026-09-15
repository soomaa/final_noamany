import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AmInvitationStatus,
  ClubClassAudience,
  ClubFitnessClassStatus,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { MemberJwtUser } from "../../common/types/member-jwt-user";
import { AppManagementService } from "../app-management/app-management.service";
import { normalizePhoneForStorage } from "../club-members/club-member.utils";
import {
  deriveSessionAwareStatus,
  toNum,
} from "../club-subscriptions/club-subscription.utils";
import { MemberCreateInvitationDto } from "./dto/member.dto";

function uploadUrl(
  base: string,
  path: string | null | undefined,
): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
    return trimmed;
  const prefix = base.endsWith("/") ? base.slice(0, -1) : base;
  const rel = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${prefix}${rel}`;
}

/** Notification `data` is stored as JSON text; return the parsed object, or the raw string if it isn't JSON. */
function parseJsonOrRaw(s: string | null): unknown {
  if (s == null) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Arabic labels for the class audience buckets shown in the member app. */
const AUDIENCE_LABELS: Record<ClubClassAudience, string> = {
  men: "رجال",
  women: "سيدات",
  kids: "أطفال",
  mixed: "مختلط",
};
const AUDIENCE_ORDER: ClubClassAudience[] = ["men", "women", "kids", "mixed"];

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appManagement: AppManagementService,
  ) {}

  private publicBase(): string {
    return this.config.get<string>("publicUploadBase") ?? "/uploads";
  }

  async getProfile(memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException("العضو غير موجود");

    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: member.branch_id },
      select: { branch_name: true },
    });
    const about = await this.appManagement.getAbout();

    return {
      fullName: member.name,
      phone: member.phone,
      profilePictureUrl: uploadUrl(this.publicBase(), member.profile_picture),
      branchName: branch?.branch_name ?? null,
      memberCode: member.member_code,
      memberId: member.id,
      barcode: member.member_code,
      termsAndConditions: about.termsOfService,
      privacyPolicy: about.privacyPolicy,
      isActive: member.is_active,
    };
  }

  /** Public privacy policy text (from app-management "about"). No auth — shown pre-login. */
  async getPrivacyPolicy() {
    const about = await this.appManagement.getAbout();
    return {
      privacyPolicy: about.privacyPolicy ?? "",
      updatedAt: about.updatedAt,
    };
  }

  /** Public terms & conditions text (companion to the privacy policy). */
  async getTerms() {
    const about = await this.appManagement.getAbout();
    return {
      termsAndConditions: about.termsOfService ?? "",
      updatedAt: about.updatedAt,
    };
  }

  async listPackages(branchId?: number) {
    const rows = await this.prisma.club_subscription_types.findMany({
      where: { is_active: true, show_in_app: true },
      orderBy: { name: "asc" },
      include: { branches: { select: { branch_id: true } } },
    });

    const filtered = branchId
      ? rows.filter(
          (r) =>
            r.apply_to_all_branches ||
            r.branch_id === branchId ||
            r.branches.some((b) => b.branch_id === branchId),
        )
      : rows;

    return filtered.map((r) => ({
      id: r.id,
      name: r.name,
      price: toNum(r.price),
      days: r.days,
      durationLabel: `${r.days} يوم`,
      isSpecialOffer: r.is_special_offer,
      isForStudents: r.is_for_students,
      invitationsCount: r.invitations_count,
      inbodyCount: r.inbody_count,
      includesSpa: r.includes_spa,
      spaCount: r.spa_count,
      sessionsCount: r.sessions_count,
      freezeDays: r.freeze_days,
      walletPoints: r.wallet_points,
      offerValidity: r.offer_validity,
    }));
  }

  /**
   * Trainers available in the member's JWT branch. A trainer belongs to a branch when they have
   * a real class, an active class/default schedule, or a linked employee whose home branch matches.
   * The branch argument is supplied only by MemberController from the verified member token.
   */
  async listTrainers(branchId: number) {
    const trainers = await this.prisma.club_trainers.findMany({
      where: { is_active: true, is_deleted: false },
      orderBy: { name: 'asc' },
    });
    if (!trainers.length) return [];

    const trainerIds = trainers.map((trainer) => trainer.id);
    const employeeIds = trainers
      .map((trainer) => trainer.employee_id)
      .filter((id): id is number => id != null);
    const [classes, classSlots, trainerSlots, employees] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: { branch_id: branchId, trainer_id: { in: trainerIds }, is_deleted: false },
        select: { trainer_id: true },
        distinct: ['trainer_id'],
      }),
      this.prisma.club_class_schedule_slots.findMany({
        where: { branch_id: branchId, trainer_id: { in: trainerIds }, is_active: true },
        select: { trainer_id: true },
        distinct: ['trainer_id'],
      }),
      this.prisma.club_trainer_schedule_slots.findMany({
        where: { branch_id: branchId, trainer_id: { in: trainerIds }, is_active: true },
        select: { trainer_id: true },
        distinct: ['trainer_id'],
      }),
      employeeIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: employeeIds }, branch_id_fk: branchId },
            select: { id: true },
          })
        : [],
    ]);

    const employeeSet = new Set(employees.map((employee) => employee.id));
    const allowed = new Set<number>([
      ...classes.map((entry) => entry.trainer_id),
      ...classSlots.flatMap((entry) => entry.trainer_id == null ? [] : [entry.trainer_id]),
      ...trainerSlots.map((entry) => entry.trainer_id),
      ...trainers
        .filter((trainer) => trainer.employee_id != null && employeeSet.has(trainer.employee_id))
        .map((trainer) => trainer.id),
    ]);

    return trainers.filter((trainer) => allowed.has(trainer.id)).map((trainer) => ({
      id: trainer.id,
      employeeId: trainer.employee_id,
      name: trainer.name,
      specialization: trainer.specialization,
      experience: trainer.experience,
      bio: trainer.bio,
      imageUrl: trainer.image_url,
      rating: toNum(trainer.rating_avg),
      branchId,
    }));
  }

  /**
   * This member's subscriptions only (`member_id` from the JWT — never another member).
   * `status` / `activePlan` use the same session-aware rules as gym check-in entitlement.
   */
  async listSubscriptions(memberId: number) {
    const rows = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId },
      orderBy: { id: "desc" },
    });

    const history = rows.map((r) => {
      const status =
        r.status === "frozen"
          ? ("frozen" as const)
          : deriveSessionAwareStatus({
              startDate: r.subscription_start_date,
              endDate: r.subscription_end_date,
              isLinkedToSessions: !!r.is_linked_to_sessions,
              sessionsCount: r.sessions_count,
              sessionsUsed: r.sessions_used,
            });
      return {
        id: r.id,
        subscriptionNumber: r.subscription_number,
        subscriptionType: r.subscription_type,
        subscriptionTypeId: r.subscription_type_id,
        startDate: r.subscription_start_date,
        endDate: r.subscription_end_date,
        value: toNum(r.subscription_value),
        paidAmount: toNum(r.paid_amount),
        remainingAmount: toNum(r.remaining_amount),
        status,
        isActive: status === "active",
        registrationDate: r.registration_date,
      };
    });

    const active = history.find((h) => h.isActive) ?? null;

    return {
      activePlan: active
        ? {
            id: active.id,
            subscriptionNumber: active.subscriptionNumber,
            subscriptionType: active.subscriptionType,
            subscriptionTypeId: active.subscriptionTypeId,
            startDate: active.startDate,
            endDate: active.endDate,
            value: active.value,
            paidAmount: active.paidAmount,
            remainingAmount: active.remainingAmount,
            status: active.status,
          }
        : null,
      history,
    };
  }

  async createInvitation(
    member: MemberJwtUser,
    dto: MemberCreateInvitationDto,
  ) {
    const phone = normalizePhoneForStorage(dto.recipientPhone);
    const last = await this.prisma.am_invitations.findFirst({
      orderBy: { id: "desc" },
    });
    const code = `INV${String((last?.id ?? 0) + 1).padStart(6, "0")}`;

    const row = await this.prisma.am_invitations.create({
      data: {
        invitation_code: code,
        recipient_name: dto.recipientName.trim(),
        recipient_phone: phone,
        recipient_email: dto.recipientEmail?.trim() || null,
        inviter_member_id: member.memberId,
        branch_id: member.branchId,
        status: "pending",
      },
    });

    return this.mapInvitation(row);
  }

  async listMyInvitations(memberId: number) {
    const rows = await this.prisma.am_invitations.findMany({
      where: { inviter_member_id: memberId },
      orderBy: { created_at: "desc" },
    });
    return Promise.all(rows.map((r) => this.mapInvitation(r)));
  }

  async listInbodyHistory(memberId: number) {
    const rows = await this.prisma.club_inbody_measurements.findMany({
      where: { member_id: memberId },
      orderBy: [{ measurement_date: "desc" }, { id: "desc" }],
    });

    return rows.map((r) => ({
      id: r.id,
      measurementDate: r.measurement_date,
      weight: r.weight != null ? toNum(r.weight) : null,
      heightCm: r.height_cm != null ? toNum(r.height_cm) : null,
      bodyFat: r.body_fat != null ? toNum(r.body_fat) : null,
      muscleMass: r.muscle_mass != null ? toNum(r.muscle_mass) : null,
      bmi: r.bmi != null ? toNum(r.bmi) : null,
      notes: r.notes,
      reportUrl: uploadUrl(this.publicBase(), r.report_url),
      createdAt: r.created_at,
    }));
  }

  // ── Freeze log (سجل الوقف) ──────────────────────────────────────────────────

  /** All freeze/suspension records for this member's subscriptions, newest first. */
  async listFreezes(memberId: number) {
    const rows = await this.prisma.club_subscription_freezes.findMany({
      where: { subscription: { member_id: memberId } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      include: {
        subscription: {
          select: {
            id: true,
            subscription_number: true,
            subscription_type: true,
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      subscriptionId: r.subscription_id,
      subscriptionNumber: r.subscription?.subscription_number ?? null,
      subscriptionType: r.subscription?.subscription_type ?? null,
      freezeStartDate: r.freeze_start_date,
      freezeEndDate: r.freeze_end_date,
      plannedDays: r.planned_days,
      actualDays: r.actual_days,
      originalEndDate: r.original_end_date,
      reason: r.reason,
      isActive: r.is_active,
      createdAt: r.created_at,
    }));
  }

  // ── Notifications (الاشعارات) ───────────────────────────────────────────────

  /** This member's notifications (newest first) plus the current unread count. */
  async listNotifications(
    memberId: number,
    opts?: { unreadOnly?: boolean; limit?: number },
  ) {
    const requestedLimit = Number.isFinite(opts?.limit)
      ? Number(opts?.limit)
      : 50;
    const take = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
    const where: Prisma.am_member_notificationsWhereInput = {
      member_id: memberId,
      is_active: true,
    };
    if (opts?.unreadOnly) where.is_read = false;

    const [rows, unreadCount] = await Promise.all([
      this.prisma.am_member_notifications.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take,
      }),
      this.prisma.am_member_notifications.count({
        where: { member_id: memberId, is_active: true, is_read: false },
      }),
    ]);

    return {
      unreadCount,
      notifications: rows.map((n) => this.mapNotification(n)),
    };
  }

  /** Unread notification count only — cheap endpoint for the app badge. */
  async getUnreadNotificationCount(memberId: number) {
    const unreadCount = await this.prisma.am_member_notifications.count({
      where: { member_id: memberId, is_active: true, is_read: false },
    });
    return { unreadCount };
  }

  /** Mark one notification read. Scoped to the member so nobody can touch others'. */
  async markNotificationRead(memberId: number, id: number) {
    const res = await this.prisma.am_member_notifications.updateMany({
      where: { id, member_id: memberId },
      data: { is_read: true, read_at: new Date() },
    });
    if (res.count === 0) throw new NotFoundException("الإشعار غير موجود");
    return { id, isRead: true };
  }

  /** Mark all of this member's notifications read. */
  async markAllNotificationsRead(memberId: number) {
    const res = await this.prisma.am_member_notifications.updateMany({
      where: { member_id: memberId, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });
    return { updated: res.count };
  }

  private mapNotification(n: {
    id: number;
    title: string;
    body: string;
    type: string;
    data: string | null;
    image_url: string | null;
    is_read: boolean;
    read_at: Date | null;
    created_at: Date;
  }) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      type: n.type,
      data: parseJsonOrRaw(n.data),
      imageUrl: uploadUrl(this.publicBase(), n.image_url),
      isRead: n.is_read,
      readAt: n.read_at,
      createdAt: n.created_at,
    };
  }

  // ── Classes (الكلاسات: رجال / سيدات / أطفال) ────────────────────────────────

  /**
   * Upcoming classes in the member's branch, grouped by audience (men / women / kids / mixed).
   * Pass `audience` to return only that bucket. Each class carries the member's own
   * enrollment flag and live capacity.
   */
  async listClasses(branchId: number, memberId: number, audience?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const where: Prisma.club_classesWhereInput = {
      branch_id: branchId,
      is_deleted: false,
      is_active: true,
      class_date: { gte: today },
      status: {
        in: [ClubFitnessClassStatus.scheduled, ClubFitnessClassStatus.ongoing],
      },
    };

    let audienceFilter: ClubClassAudience | undefined;
    if (audience && audience !== "all") {
      if (!AUDIENCE_ORDER.includes(audience as ClubClassAudience)) {
        throw new BadRequestException("نوع الكلاس غير صحيح");
      }
      audienceFilter = audience as ClubClassAudience;
      where.audience = audienceFilter;
    }

    const rows = await this.prisma.club_classes.findMany({
      where,
      orderBy: [{ class_date: "asc" }, { start_time: "asc" }],
      include: {
        trainer: { select: { name: true } },
        hall: { select: { name: true } },
        enrollments: {
          where: { attendance_status: { not: "cancelled" } },
          select: { member_id: true },
        },
      },
    });

    const items = rows.map((r) => {
      const enrolledCount = r.enrollments.length;
      return {
        id: r.id,
        className: r.class_name,
        description: r.description,
        audience: r.audience,
        audienceLabel: AUDIENCE_LABELS[r.audience],
        classDate: r.class_date,
        startTime: r.start_time,
        endTime: r.end_time,
        trainerName: r.trainer?.name ?? null,
        hallName: r.hall?.name ?? null,
        maxCapacity: r.max_capacity,
        enrolledCount,
        availableSpots: Math.max(r.max_capacity - enrolledCount, 0),
        isFull: enrolledCount >= r.max_capacity,
        price: toNum(r.price),
        status: r.status,
        isEnrolled: r.enrollments.some((e) => e.member_id === memberId),
      };
    });

    const buckets = audienceFilter ? [audienceFilter] : AUDIENCE_ORDER;
    return {
      total: items.length,
      audiences: buckets.map((aud) => {
        const classes = items.filter((it) => it.audience === aud);
        return {
          audience: aud,
          label: AUDIENCE_LABELS[aud],
          count: classes.length,
          classes,
        };
      }),
    };
  }

  // ── Points log (سجل النقاط) ─────────────────────────────────────────────────

  /** Uses the imported earn/redeem ledger when present, with the subscription-derived
   * behavior retained only for members that have no historical ledger rows. */
  async listPoints(memberId: number) {
    const ledger = await this.prisma.club_member_point_transactions.findMany({
      where: { member_id: memberId, is_deleted: false },
      orderBy: [{ occurred_at: "asc" }, { id: "asc" }],
    });

    if (ledger.length > 0) {
      const subscriptionIds = [
        ...new Set(
          ledger
            .map((entry) => entry.subscription_id)
            .filter((id): id is number => id !== null),
        ),
      ];
      const subscriptions = subscriptionIds.length
        ? await this.prisma.club_subscriptions.findMany({
            where: { id: { in: subscriptionIds } },
            select: { id: true, subscription_number: true },
          })
        : [];
      const subscriptionNumbers = new Map(
        subscriptions.map((subscription) => [
          subscription.id,
          subscription.subscription_number,
        ]),
      );

      let balance = 0;
      let totalEarned = 0;
      let totalRedeemed = 0;
      const chronological = ledger.map((entry) => {
        const points = Math.abs(entry.points);
        const isEarn = entry.transaction_type === "earn";
        if (isEarn) totalEarned += points;
        else totalRedeemed += points;
        balance += isEarn ? points : -points;
        const occurredAt = entry.occurred_at ?? entry.created_at;
        return {
          id: entry.id,
          type: isEarn ? ("earn" as const) : ("redeem" as const),
          points,
          balanceAfter: balance,
          reason: entry.action_name ?? (isEarn ? "إضافة نقاط" : "استبدال نقاط"),
          subscriptionId: entry.subscription_id,
          subscriptionNumber: entry.subscription_id
            ? (subscriptionNumbers.get(entry.subscription_id) ?? null)
            : null,
          date: occurredAt.toISOString().slice(0, 10),
          createdAt: occurredAt,
        };
      });

      return {
        balance,
        totalEarned,
        totalRedeemed,
        history: chronological.reverse(),
      };
    }

    const subs = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId },
      orderBy: [{ registration_date: "asc" }, { id: "asc" }],
      include: { type: { select: { wallet_points: true, name: true } } },
    });

    let running = 0;
    const chronological = subs
      .map((s) => ({ s, points: s.type?.wallet_points ?? 0 }))
      .filter((e) => e.points > 0)
      .map((e) => {
        running += e.points;
        return {
          id: e.s.id,
          type: "earn" as const,
          points: e.points,
          balanceAfter: running,
          reason: e.s.subscription_type ?? e.s.type?.name ?? "اشتراك",
          subscriptionId: e.s.id,
          subscriptionNumber: e.s.subscription_number,
          date: e.s.registration_date,
          createdAt: e.s.created_at,
        };
      });

    const totalEarned = running;
    return {
      balance: totalEarned,
      totalEarned,
      totalRedeemed: 0,
      history: chronological.reverse(), // newest first for display
    };
  }

  private async mapInvitation(row: {
    id: number;
    invitation_code: string;
    recipient_name: string;
    recipient_email: string | null;
    recipient_phone: string | null;
    inviter_member_id: number | null;
    sent_date: Date;
    status: AmInvitationStatus;
    accepted_date: Date | null;
    rejected_date: Date | null;
    rejection_reason: string | null;
    attendance_date: Date | null;
    branch_id: number | null;
    created_at: Date;
  }) {
    let branchName: string | null = null;
    if (row.branch_id != null) {
      const b = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: row.branch_id },
        select: { branch_name: true },
      });
      branchName = b?.branch_name ?? null;
    }
    return {
      id: row.id,
      invitationCode: row.invitation_code,
      recipientName: row.recipient_name,
      recipientPhone: row.recipient_phone,
      recipientEmail: row.recipient_email,
      sentDate: row.sent_date,
      status: row.status,
      acceptedDate: row.accepted_date,
      rejectedDate: row.rejected_date,
      rejectionReason: row.rejection_reason,
      attendanceDate: row.attendance_date,
      branchId: row.branch_id,
      branchName,
      createdAt: row.created_at,
    };
  }
}
