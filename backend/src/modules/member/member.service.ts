import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmInvitationStatus, ClubClassAudience, ClubFitnessClassStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { AppManagementService } from '../app-management/app-management.service';
import {
  buildDefaultSessionPriceMatrix,
  deriveSessionAwareStatus,
  resolveTypePriceForBranch,
  roundMoney,
  scaleSessionMatrixForPackagePrice,
  toNum,
} from '../club-subscriptions/club-subscription.utils';
import { loadSubscriptionTypeBranchPrices } from '../club-subscriptions/club-subscription-branch-prices.loader';
import { isPromoLive, withOffersTag } from '../club-subscriptions/package-categories';
import {
  localDateString,
  recalculateTrainerRatingAvg,
  splitSpecializations,
} from '../club-fitness/club-fitness.utils';
import { MemberCreateInvitationDto, MemberRateTrainerDto } from './dto/member.dto';
import { GateCredentialService } from '../gate-access/gate-credential.service';
import { uploadReferenceUrl } from '../../common/uploads/upload-reference-url';
import { UploadsService } from '../uploads/uploads.service';
import { hasMemberPhoto, memberPhotoUrl } from './member-photo-policy';

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
  men: 'رجال',
  women: 'سيدات',
  kids: 'أطفال',
  mixed: 'مختلط',
};
const AUDIENCE_ORDER: ClubClassAudience[] = ['men', 'women', 'kids', 'mixed'];

/** weekday 0 = الأحد, matching `club_trainer_schedule_slots.weekday` and `Date#getUTCDay()`. */
const AR_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Same fallback the trainer portal uses when a class type has no colour. */
const DEFAULT_CLASS_COLOR = '#2563EB';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Days covered by the default `GET /member/attendance` window, today inclusive. */
const ATTENDANCE_WINDOW_DAYS = 180;

/** Shift a `YYYY-MM-DD` date by whole days, anchored at UTC noon to dodge DST. */
function shiftIsoDate(date: string, days: number): string {
  const anchor = new Date(`${date}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Calendar-valid `YYYY-MM-DD` (rejects 2026-02-30, which JS would roll into March). */
function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type AttendanceStreak = {
  currentStreak: number;
  bestStreak: number;
  lastVisitDate: string | null;
};

/**
 * Streak maths for the mobile "streak" card, kept pure so it is unit-testable without Prisma.
 *
 * `days` are visit days (`YYYY-MM-DD`); duplicates and unsorted input are tolerated because a
 * member can check in more than once a day and each day must still count exactly once.
 *
 * `currentStreak` is the run of consecutive days ending today, or ending yesterday when there is
 * no visit yet today — otherwise the card would read "broken" from midnight until the member
 * walks in. Anything older than yesterday means the streak is genuinely over, so 0.
 * `bestStreak` is the longest run anywhere in `days`.
 */
export function computeAttendanceStreak(days: string[], today: string): AttendanceStreak {
  const unique = Array.from(new Set(days)).sort();
  if (!unique.length) return { currentStreak: 0, bestStreak: 0, lastVisitDate: null };

  let bestStreak = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    run = shiftIsoDate(unique[i - 1], 1) === unique[i] ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  const lastVisitDate = unique[unique.length - 1];
  const yesterday = shiftIsoDate(today, -1);
  let currentStreak = 0;
  if (lastVisitDate === today || lastVisitDate === yesterday) {
    currentStreak = 1;
    for (let i = unique.length - 1; i > 0; i--) {
      if (shiftIsoDate(unique[i - 1], 1) !== unique[i]) break;
      currentStreak++;
    }
  }

  return { currentStreak, bestStreak, lastVisitDate };
}

export type MemberOwnRating = {
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null;

/** The caller's own member-app rating row, or null when they have not rated this trainer yet. */
function mapMyRating(
  row: { rating: Prisma.Decimal | number; comment: string | null; created_at: Date; updated_at: Date } | null,
): MemberOwnRating {
  if (!row) return null;
  return {
    rating: toNum(row.rating),
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appManagement: AppManagementService,
    private readonly gateCredentials: GateCredentialService,
    private readonly uploads: UploadsService,
  ) {}

  private publicBase(): string {
    return this.config.get<string>('publicUploadBase') ?? '/uploads';
  }

  async getProfile(memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');

    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: member.branch_id },
      select: { branch_name: true },
    });
    const about = await this.appManagement.getAbout();
    // The app barcode carries the numeric gate credential (7 digits) so the
    // same code opens the C3-200 turnstile via QR50BE/Wiegand-26 and still
    // resolves at reception (resolveByIdOrCode accepts credential_no).
    // member_code (e.g. A000123) stays the human-facing identifier.
    const gateCredential = await this.gateCredentials.ensureForMember(member.id);
    const gateCode = gateCredential.is_active
      && /^[1-9]\d{0,7}$/.test(gateCredential.credential_no)
      && Number(gateCredential.credential_no) <= 16_777_215
      ? gateCredential.credential_no : null;
    return {
      fullName: member.name,
      phone: member.phone,
      profilePictureUrl: memberPhotoUrl(this.publicBase(), member.profile_picture),
      profilePhotoLocked: member.profile_photo_locked || hasMemberPhoto(member.profile_picture),
      branchName: branch?.branch_name ?? null,
      branchId: member.branch_id,
      memberCode: member.member_code,
      memberId: member.id,
      barcode: gateCode,
      barcodeValue: gateCode,
      gateCode,
      termsAndConditions: about.termsOfService,
      privacyPolicy: about.privacyPolicy,
      isActive: member.is_active,
    };
  }

  async updateProfilePhoto(memberUser: MemberJwtUser, file: Express.Multer.File) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberUser.memberId, app_user_id: memberUser.sub, is_deleted: false },
      select: { id: true, app_user_id: true, branch_id: true, profile_picture: true, profile_photo_locked: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    const locked = () => new ConflictException({
      code: 'MEMBER_PHOTO_LOCKED',
      message: 'تم تسجيل صورتك بالفعل. لتغييرها، يرجى الرجوع إلى الاستقبال.',
    });
    if (member.profile_photo_locked || hasMemberPhoto(member.profile_picture)) throw locked();

    const stored = await this.uploads.storeMemberProfile(file, memberUser);
    try {
      await this.prisma.$transaction(async (tx) => {
        // Compare-and-set handles simultaneous uploads and staff edits. Only one wins.
        const claimed = await tx.club_members.updateMany({
          where: {
            id: member.id, app_user_id: memberUser.sub, is_deleted: false,
            profile_photo_locked: false, profile_picture: member.profile_picture,
          },
          data: { profile_picture: stored.path, profile_photo_locked: true },
        });
        if (claimed.count !== 1) throw locked();
        if (member.app_user_id != null) {
          await tx.api_users.update({
            where: { user_id: member.app_user_id }, data: { m_image: stored.path },
          });
        }
        await tx.business_audit_log.create({
          data: {
            entity_type: 'club_member', entity_id: String(member.id),
            action: 'profile.photo.updated', actor_user_id: memberUser.sub,
            actor_name: memberUser.name, branch_id: member.branch_id,
            before_json: { profilePicture: member.profile_picture },
            after_json: { profilePicture: stored.path, profilePhotoLocked: true },
            changed_fields: ['profile_picture', 'profile_photo_locked'],
          },
        });
      });
    } catch (error) {
      await this.uploads.discardMemberProfile(stored.id, memberUser).catch(() => {
        Logger.error('Could not discard an uncommitted member photo', 'MemberService');
      });
      throw error;
    }
    return {
      message: 'تم حفظ صورتك. يمكنك تغييرها لاحقًا من خلال الاستقبال فقط.',
      memberId: member.id,
      profilePicture: stored.path, profilePictureUrl: stored.url, profilePhotoLocked: true,
    };
  }

  /** Public privacy policy text (from app-management "about"). No auth — shown pre-login. */
  async getPrivacyPolicy() {
    const about = await this.appManagement.getAbout();
    return {
      privacyPolicy: about.privacyPolicy ?? '',
      updatedAt: about.updatedAt,
    };
  }

  /** Public terms & conditions text (companion to the privacy policy). */
  async getTerms() {
    const about = await this.appManagement.getAbout();
    return {
      termsAndConditions: about.termsOfService ?? '',
      updatedAt: about.updatedAt,
    };
  }

  async listPackages(branchId: number) {
    const rows = await this.prisma.club_subscription_types.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      include: {
        branches: { select: { branch_id: true } },
        categories: { select: { category: true } },
        session_prices: {
          select: { sessions_count: true, price: true },
          orderBy: { sessions_count: 'asc' },
        },
      },
    });

    const assigned = rows.filter(
      (r) => r.apply_to_all_branches || r.branch_id === branchId || r.branches.some((b) => b.branch_id === branchId),
    );
    const filtered = assigned.filter((row) => {
      if (row.source_subscription_type_id != null) return true;
      return !assigned.some((candidate) => candidate.source_subscription_type_id === row.id);
    });
    // Per-branch price overrides: the member sees exactly what reception would charge here.
    const branchPrices = await loadSubscriptionTypeBranchPrices(this.prisma, filtered.map((r) => r.id));

    return filtered.map((r) => {
      const defaultPrice = toNum(r.price);
      const price = resolveTypePriceForBranch(defaultPrice, branchId, branchPrices.get(r.id));
      const promoActive = isPromoLive(r.promo_enabled, r.promo_ends_at);
      const configuredPrices = scaleSessionMatrixForPackagePrice(
        r.session_prices.map((row) => ({
          sessionsCount: row.sessions_count,
          price: toNum(row.price),
        })),
        defaultPrice,
        price,
      );
      const sessionPrices = r.is_linked_to_sessions && configuredPrices.length === 0
        ? buildDefaultSessionPriceMatrix(price, r.sessions_count ?? 0)
        : configuredPrices;
      return {
      id: r.id,
      name: r.name,
      price,
      days: r.days,
      durationLabel: `${r.days} يوم`,
      isSpecialOffer: r.is_special_offer,
      isForStudents: r.is_for_students,
      invitationsCount: r.invitations_count,
      inbodyCount: r.inbody_count,
      includesSpa: r.includes_spa,
      spaCount: r.spa_count,
      isLinkedToSessions: r.is_linked_to_sessions,
      sessionsCount: r.sessions_count,
      sessionPrices,
      freezeDays: r.freeze_days,
      freezeTotalDays: r.freeze_total_days,
      walletPoints: r.wallet_points,
      offerValidity: r.offer_validity,
      promoEnabled: promoActive,
      promoPrice: promoActive && r.promo_price != null ? toNum(r.promo_price) : null,
      promoDiscountPercent: promoActive && r.promo_discount_percent != null ? toNum(r.promo_discount_percent) : null,
      promoImage: promoActive ? uploadReferenceUrl(this.publicBase(), r.promo_image) : null,
      promoEndsAt: promoActive ? r.promo_ends_at : null,
      promoMarketingMessage: promoActive ? r.promo_marketing_message : null,
      appNotes: r.app_notes,
      // A live promo puts the package in the "عروض" section whatever it was tagged with.
      categories: withOffersTag((r.categories ?? []).map((c) => c.category), promoActive),
      };
    });
  }

  /** Real operational trainers assigned to the member's branch. */
  async listTrainers(branchId: number) {
    const trainers = await this.prisma.club_trainers.findMany({
      where: { is_active: true, is_deleted: false },
      orderBy: { name: 'asc' },
    });
    if (!trainers.length) return [];

    const branchTrainerIds = await this.reachableTrainerIds(branchId, trainers);
    const visible = trainers.filter((trainer) => branchTrainerIds.has(trainer.id));
    if (!visible.length) return [];
    const availabilityRows = await this.prisma.club_trainer_availability.findMany({
      where: { trainer_id: { in: visible.map((trainer) => trainer.id) }, is_active: true },
      orderBy: [{ trainer_id: 'asc' }, { weekday: 'asc' }, { start_time: 'asc' }],
    });

    return visible.map((trainer) => ({
      id: trainer.id,
      employeeId: trainer.employee_id,
      name: trainer.name,
      specialization: trainer.specialization,
      specializations: splitSpecializations(trainer.specialization),
      experience: trainer.experience,
      bio: trainer.bio,
      imageUrl: uploadReferenceUrl(this.publicBase(), trainer.image_url),
      rating: toNum(trainer.rating_avg),
      branchId,
      availability: availabilityRows
        .filter((slot) => slot.trainer_id === trainer.id)
        .map((slot) => ({ weekday: slot.weekday, startTime: slot.start_time, endTime: slot.end_time })),
    }));
  }

  /**
   * Which of `trainers` the given branch can see. A trainer belongs to a branch when they are
   * scheduled/worked there (dated class, class template slot, weekly trainer slot) or their
   * linked employee record belongs there. Single source of truth for every member trainer route.
   */
  private async reachableTrainerIds(
    branchId: number,
    trainers: Array<{ id: number; employee_id: number | null }>,
  ): Promise<Set<number>> {
    const trainerIds = trainers.map((trainer) => trainer.id);
    const employeeIds = trainers
      .map((trainer) => trainer.employee_id)
      .filter((id): id is number => id != null);
    const [datedClasses, classSlots, trainerSlots, branchEmployees] = await Promise.all([
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

    const employeeIdSet = new Set(branchEmployees.map((employee) => employee.id));
    return new Set<number>([
      ...datedClasses.map((row) => row.trainer_id),
      ...classSlots.flatMap((row) => (row.trainer_id == null ? [] : [row.trainer_id])),
      ...trainerSlots.map((row) => row.trainer_id),
      ...trainers
        .filter((trainer) => trainer.employee_id != null && employeeIdSet.has(trainer.employee_id))
        .map((trainer) => trainer.id),
    ]);
  }

  /**
   * Load one trainer the branch is allowed to see. Every failure mode — missing, inactive,
   * deleted, or belonging to another branch — collapses into the same 404 so the endpoint
   * never leaks the existence of trainers outside the member's branch.
   */
  private async ownBranchTrainer(branchId: number, trainerId: number) {
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_active: true, is_deleted: false },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');
    const reachable = await this.reachableTrainerIds(branchId, [trainer]);
    if (!reachable.has(trainer.id)) throw new NotFoundException('المدرب غير موجود');
    return trainer;
  }

  /**
   * Trainer profile screen: bio card plus the trainer's weekly classes in the member's branch.
   * Slots that share a class type and time are collapsed into one entry carrying all of their
   * weekdays, so the app can render "الأحد - الثلاثاء - الخميس، 7:00 م - 8:00 م" as one row.
   *
   * `myRating` is the caller's own member-app rating (`app_member_id`), never one of their
   * per-attendance ratings; pass memberId 0 for a guest and it is always null.
   */
  async getTrainer(branchId: number, memberId: number, trainerId: number) {
    const trainer = await this.ownBranchTrainer(branchId, trainerId);

    const [ratingsCount, slots, availabilityRows, myRatingRow] = await Promise.all([
      this.prisma.club_trainer_ratings.count({ where: { trainer_id: trainer.id } }),
      this.prisma.club_trainer_schedule_slots.findMany({
        where: {
          trainer_id: trainer.id,
          branch_id: branchId,
          is_active: true,
          class_type: { is_active: true, is_deleted: false },
        },
        orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
        include: {
          class_type: { select: { id: true, name: true, color: true } },
          hall: { select: { name: true } },
        },
      }),
      // أيام التواجد — standalone presence days, unrelated to the class calendar above.
      this.prisma.club_trainer_availability.findMany({
        where: { trainer_id: trainer.id, is_active: true },
        orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
      }),
      memberId > 0
        ? this.prisma.club_trainer_ratings.findFirst({
            where: { trainer_id: trainer.id, app_member_id: memberId },
          })
        : null,
    ]);

    const grouped = new Map<
      string,
      {
        classTypeId: number;
        className: string;
        color: string;
        weekdays: number[];
        startTime: string;
        endTime: string;
        hallName: string | null;
        maxCapacity: number;
        audience: ClubClassAudience;
      }
    >();
    for (const slot of slots) {
      const key = `${slot.class_type_id}:${slot.start_time}:${slot.end_time}`;
      const existing = grouped.get(key);
      if (existing) {
        if (!existing.weekdays.includes(slot.weekday)) existing.weekdays.push(slot.weekday);
        continue;
      }
      grouped.set(key, {
        classTypeId: slot.class_type_id,
        className: slot.class_type.name,
        color: slot.class_type.color || DEFAULT_CLASS_COLOR,
        weekdays: [slot.weekday],
        startTime: slot.start_time,
        endTime: slot.end_time,
        hallName: slot.hall?.name ?? null,
        maxCapacity: slot.max_capacity,
        audience: slot.audience,
      });
    }

    const classes = [...grouped.values()]
      .map((group) => {
        const weekdays = [...group.weekdays].sort((a, b) => a - b);
        return {
          classTypeId: group.classTypeId,
          className: group.className,
          color: group.color,
          weekdays,
          dayNames: weekdays.map((day) => AR_WEEKDAYS[day] ?? String(day)),
          startTime: group.startTime,
          endTime: group.endTime,
          hallName: group.hallName,
          maxCapacity: group.maxCapacity,
          audience: group.audience,
          audienceLabel: AUDIENCE_LABELS[group.audience],
        };
      })
      .sort((a, b) => a.weekdays[0] - b.weekdays[0] || a.startTime.localeCompare(b.startTime));

    return {
      id: trainer.id,
      name: trainer.name,
      specialization: trainer.specialization,
      specializations: splitSpecializations(trainer.specialization),
      experience: trainer.experience,
      bio: trainer.bio,
      imageUrl: uploadReferenceUrl(this.publicBase(), trainer.image_url),
      rating: toNum(trainer.rating_avg),
      ratingsCount,
      myRating: mapMyRating(myRatingRow),
      branchId,
      availability: availabilityRows.map((row) => ({
        weekday: row.weekday,
        dayNameAr: AR_WEEKDAYS[row.weekday] ?? String(row.weekday),
        startTime: row.start_time,
        endTime: row.end_time,
      })),
      classes,
    };
  }

  /**
   * تقييم المدرب — the signed-in member's single app rating for one trainer, created or edited.
   * Keyed on `(trainer_id, app_member_id)` so the member's per-attendance ratings (which carry
   * `attendance_id` and a NULL `app_member_id`) are never touched. The average is recalculated
   * inside the same transaction so `rating` can never drift from the rows behind it.
   */
  async rateTrainer(branchId: number, memberId: number, trainerId: number, dto: MemberRateTrainerDto) {
    const trainer = await this.ownBranchTrainer(branchId, trainerId);
    const comment = dto.comment?.trim() ? dto.comment.trim() : null;

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.club_trainer_ratings.upsert({
        where: { trainer_id_app_member_id: { trainer_id: trainer.id, app_member_id: memberId } },
        create: {
          trainer_id: trainer.id,
          member_id: memberId,
          app_member_id: memberId,
          rating: dto.rating,
          comment,
        },
        update: { rating: dto.rating, comment },
      });
      const rating = await recalculateTrainerRatingAvg(tx, trainer.id);
      const ratingsCount = await tx.club_trainer_ratings.count({ where: { trainer_id: trainer.id } });
      return { row, rating, ratingsCount };
    });

    return {
      rating: saved.rating,
      ratingsCount: saved.ratingsCount,
      myRating: mapMyRating(saved.row),
    };
  }

  /**
   * Removes only this member's own app rating (`app_member_id`), never their per-attendance
   * ratings. Idempotent: deleting a rating that is not there still returns the current summary
   * rather than a 404, so a double tap in the app is harmless.
   */
  async deleteTrainerRating(branchId: number, memberId: number, trainerId: number) {
    const trainer = await this.ownBranchTrainer(branchId, trainerId);

    const summary = await this.prisma.$transaction(async (tx) => {
      await tx.club_trainer_ratings.deleteMany({
        where: { trainer_id: trainer.id, app_member_id: memberId },
      });
      const rating = await recalculateTrainerRatingAvg(tx, trainer.id);
      const ratingsCount = await tx.club_trainer_ratings.count({ where: { trainer_id: trainer.id } });
      return { rating, ratingsCount };
    });

    return { rating: summary.rating, ratingsCount: summary.ratingsCount, myRating: null };
  }

  /**
   * Ratings for one trainer. `total`/`averageRating`/`distribution` cover every rating row
   * (per-attendance, member-app and staff); `reviews` only carries the ones with a comment.
   * Privacy: reviews expose the reviewer's FIRST NAME ONLY — never the full name or member id.
   */
  async listTrainerReviews(branchId: number, trainerId: number, limit?: number) {
    const trainer = await this.ownBranchTrainer(branchId, trainerId);
    const requestedLimit = Number.isFinite(limit) ? Number(limit) : 20;
    const take = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);

    const ratings = await this.prisma.club_trainer_ratings.findMany({
      where: { trainer_id: trainer.id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });

    const total = ratings.length;
    const distribution: Record<'1' | '2' | '3' | '4' | '5', number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    let sum = 0;
    for (const row of ratings) {
      const value = toNum(row.rating);
      sum += value;
      const bucket = Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
      distribution[String(bucket) as '1' | '2' | '3' | '4' | '5'] += 1;
    }
    const averageRating = total ? roundMoney(sum / total) : 0;

    const commented = ratings.filter((row) => (row.comment ?? '').trim().length > 0).slice(0, take);
    const memberIds = [
      ...new Set(commented.map((row) => row.member_id).filter((id): id is number => id != null)),
    ];
    const members = memberIds.length
      ? await this.prisma.club_members.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, name: true },
        })
      : [];
    const firstNames = new Map(
      members.map((m) => [m.id, m.name?.trim().split(/\s+/)[0] || 'عضو'] as const),
    );

    return {
      total,
      averageRating,
      distribution,
      reviews: commented.map((row) => ({
        id: row.id,
        rating: toNum(row.rating),
        comment: (row.comment ?? '').trim(),
        createdAt: row.created_at,
        memberName: (row.member_id != null ? firstNames.get(row.member_id) : null) ?? 'عضو',
      })),
    };
  }

  /**
   * This member's subscriptions only (`member_id` from the JWT — never another member).
   * `status` / `activePlan` use the same session-aware rules as gym check-in entitlement.
   */
  async listSubscriptions(memberId: number) {
    const rows = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId },
      orderBy: { id: 'desc' },
    });

    const history = rows.map((r) => {
      const status =
        r.status === 'frozen'
          ? ('frozen' as const)
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
        notes: r.notes ?? null,
        subscriptionType: r.subscription_type,
        subscriptionTypeId: r.subscription_type_id,
        startDate: r.subscription_start_date,
        endDate: r.subscription_end_date,
        value: toNum(r.subscription_value),
        paidAmount: toNum(r.paid_amount),
        remainingAmount: toNum(r.remaining_amount),
        status,
        isActive: status === 'active',
        registrationDate: r.registration_date,
      };
    });

    const active = history.find((h) => h.isActive) ?? null;

    return {
      activePlan: active
        ? {
            id: active.id,
            subscriptionNumber: active.subscriptionNumber,
            notes: active.notes,
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

  async createInvitation(member: MemberJwtUser, dto: MemberCreateInvitationDto) {
    return this.appManagement.createInvitation({
      recipientName: dto.recipientName.trim(),
      recipientPhone: dto.recipientPhone,
      recipientEmail: dto.recipientEmail?.trim() || undefined,
      inviterMemberId: member.memberId,
      branchId: member.branchId,
      status: 'pending',
    });
  }

  async listMyInvitations(memberId: number) {
    const rows = await this.prisma.am_invitations.findMany({
      where: { inviter_member_id: memberId },
      orderBy: { created_at: 'desc' },
    });
    return Promise.all(rows.map((r) => this.mapInvitation(r)));
  }

  async listInbodyHistory(memberId: number) {
    const rows = await this.prisma.club_inbody_measurements.findMany({
      where: { member_id: memberId },
      orderBy: [{ measurement_date: 'desc' }, { id: 'desc' }],
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
      reportUrl: uploadReferenceUrl(this.publicBase(), r.report_url),
      createdAt: r.created_at,
    }));
  }

  // ── Freeze log (سجل الوقف) ──────────────────────────────────────────────────

  /** All freeze/suspension records for this member's subscriptions, newest first. */
  async listFreezes(memberId: number) {
    const rows = await this.prisma.club_subscription_freezes.findMany({
      where: { subscription: { member_id: memberId } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: {
        subscription: {
          select: { id: true, subscription_number: true, subscription_type: true },
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
  async listNotifications(memberId: number, opts?: { unreadOnly?: boolean; limit?: number }) {
    const requestedLimit = Number.isFinite(opts?.limit) ? Number(opts?.limit) : 50;
    const take = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);
    const where: Prisma.am_member_notificationsWhereInput = {
      member_id: memberId,
      is_active: true,
    };
    if (opts?.unreadOnly) where.is_read = false;

    const [rows, unreadCount] = await Promise.all([
      this.prisma.am_member_notifications.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
    if (res.count === 0) throw new NotFoundException('الإشعار غير موجود');
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
      imageUrl: uploadReferenceUrl(this.publicBase(), n.image_url),
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
      status: { in: [ClubFitnessClassStatus.scheduled, ClubFitnessClassStatus.ongoing] },
    };

    let audienceFilter: ClubClassAudience | undefined;
    if (audience && audience !== 'all') {
      if (!AUDIENCE_ORDER.includes(audience as ClubClassAudience)) {
        throw new BadRequestException('نوع الكلاس غير صحيح');
      }
      audienceFilter = audience as ClubClassAudience;
      where.audience = audienceFilter;
    }

    const rows = await this.prisma.club_classes.findMany({
      where,
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
      include: {
        trainer: { select: { name: true } },
        hall: { select: { name: true } },
        enrollments: {
          where: { attendance_status: { not: 'cancelled' } },
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
      appliedAudience: audienceFilter ?? 'all',
      classes: items,
      audiences: buckets.map((aud) => {
        const classes = items.filter((it) => it.audience === aud);
        return { audience: aud, label: AUDIENCE_LABELS[aud], count: classes.length, classes };
      }),
    };
  }

  // ── Weekly class calendar (جدول الأسبوع) ────────────────────────────────────

  /** The seven `YYYY-MM-DD` dates starting at `start`, anchored at UTC noon to dodge DST. */
  private weekDates(start: string) {
    const anchor = new Date(`${start}T12:00:00Z`);
    return Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(anchor);
      day.setUTCDate(day.getUTCDate() + offset);
      return { value: day.toISOString().slice(0, 10), weekday: day.getUTCDay() };
    });
  }

  /**
   * Seven days of classes for the branch, always exactly seven entries so the app can render a
   * full week even when some days are empty.
   *
   * Merges materialised `club_classes` rows with "virtual" sessions projected from the weekly
   * `club_trainer_schedule_slots` templates, using the SAME de-duplication keys as the trainer
   * portal (`slot:{id}:{date}` and `class:{typeId}:{date}:{startTime}`): a saved weekly slot is a
   * real commitment even before management presses "generate week", but it must never duplicate a
   * session that already exists — including a cancelled or rescheduled one.
   */
  async getWeekClasses(branchId: number, memberId: number, start?: string) {
    const requested = start?.trim();
    const startDate = requested && requested.length ? requested : localDateString();
    if (!isIsoDate(startDate)) {
      throw new BadRequestException('صيغة التاريخ غير صحيحة، استخدم YYYY-MM-DD');
    }

    const days = this.weekDates(startDate);
    const endDate = days[days.length - 1].value;

    const [classes, slots] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          branch_id: branchId,
          is_deleted: false,
          class_date: { gte: startDate, lte: endDate },
        },
        orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
        include: {
          trainer: { select: { id: true, name: true } },
          hall: { select: { name: true } },
          class_type: { select: { color: true } },
          enrollments: {
            where: { attendance_status: { not: 'cancelled' } },
            select: { member_id: true },
          },
        },
      }),
      this.prisma.club_trainer_schedule_slots.findMany({
        where: {
          branch_id: branchId,
          is_active: true,
          class_type: { is_active: true, is_deleted: false },
        },
        orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
        include: {
          trainer: { select: { id: true, name: true } },
          hall: { select: { name: true } },
          class_type: { select: { id: true, name: true, color: true, single_session_price: true } },
        },
      }),
    ]);

    // Built from EVERY non-deleted row (cancelled ones included) so a cancelled session never
    // reappears as a virtual one; only bookable rows are rendered below.
    const materialized = new Set(
      classes.flatMap((cls) => [
        cls.trainer_schedule_slot_id ? `slot:${cls.trainer_schedule_slot_id}:${cls.class_date}` : '',
        `class:${cls.class_type_id}:${cls.class_date}:${cls.start_time}`,
      ]),
    );
    const bookable = classes.filter(
      (cls) =>
        cls.is_active &&
        (cls.status === ClubFitnessClassStatus.scheduled || cls.status === ClubFitnessClassStatus.ongoing),
    );

    let virtualId = -1;
    const result = days.map((day) => {
      const real = bookable
        .filter((cls) => cls.class_date === day.value)
        .map((cls) => {
          const enrolledCount = cls.enrollments.length;
          return {
            id: cls.id,
            classTypeId: cls.class_type_id,
            className: cls.class_name,
            color: cls.class_type?.color || DEFAULT_CLASS_COLOR,
            startTime: cls.start_time,
            endTime: cls.end_time,
            trainerId: cls.trainer_id,
            trainerName: cls.trainer?.name ?? null,
            hallName: cls.hall?.name ?? null,
            maxCapacity: cls.max_capacity,
            enrolledCount,
            availableSpots: Math.max(cls.max_capacity - enrolledCount, 0),
            isFull: enrolledCount >= cls.max_capacity,
            audience: cls.audience,
            audienceLabel: AUDIENCE_LABELS[cls.audience],
            price: toNum(cls.price),
            isEnrolled: memberId > 0 && cls.enrollments.some((e) => e.member_id === memberId),
            isVirtual: false,
          };
        });

      const virtual = slots
        .filter(
          (slot) =>
            slot.weekday === day.weekday &&
            !materialized.has(`slot:${slot.id}:${day.value}`) &&
            !materialized.has(`class:${slot.class_type_id}:${day.value}:${slot.start_time}`),
        )
        .map((slot) => ({
          id: virtualId--,
          classTypeId: slot.class_type_id,
          className: slot.class_type.name,
          color: slot.class_type.color || DEFAULT_CLASS_COLOR,
          startTime: slot.start_time,
          endTime: slot.end_time,
          trainerId: slot.trainer_id,
          trainerName: slot.trainer?.name ?? null,
          hallName: slot.hall?.name ?? null,
          maxCapacity: slot.max_capacity,
          enrolledCount: 0,
          availableSpots: Math.max(slot.max_capacity, 0),
          isFull: false,
          audience: slot.audience,
          audienceLabel: AUDIENCE_LABELS[slot.audience],
          price: toNum(slot.class_type.single_session_price),
          isEnrolled: false,
          isVirtual: true,
        }));

      return {
        date: day.value,
        weekday: day.weekday,
        dayNameAr: AR_WEEKDAYS[day.weekday],
        dayNameEn: EN_WEEKDAYS[day.weekday],
        sessions: [...real, ...virtual].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      };
    });

    return { start: startDate, end: endDate, days: result };
  }

  // ── Special package schedule (جدول الاشتراك الخاص) ──────────────────────────

  /**
   * The weekly grid + trainers behind one scheduled ("special") class type. The class type must
   * have a live trainer slot in this branch, otherwise it does not exist as far as this member
   * (or guest) is concerned.
   */
  async getClassTypeSchedule(branchId: number, classTypeId: number) {
    const classType = await this.prisma.club_class_types.findFirst({
      where: {
        id: classTypeId,
        is_active: true,
        is_deleted: false,
        trainer_schedule_slots: { some: { is_active: true, branch_id: branchId } },
      },
    });
    if (!classType) throw new NotFoundException('الباقة غير موجودة');

    const slots = await this.prisma.club_trainer_schedule_slots.findMany({
      where: { class_type_id: classType.id, branch_id: branchId, is_active: true },
      orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }, { id: 'asc' }],
      include: {
        trainer: { select: { id: true, name: true, image_url: true, rating_avg: true, is_active: true, is_deleted: true } },
        hall: { select: { name: true } },
      },
    });
    const liveSlots = slots.filter((slot) => slot.trainer && slot.trainer.is_active && !slot.trainer.is_deleted);

    const trainers = [
      ...new Map(
        liveSlots.map((slot) => [
          slot.trainer.id,
          {
            id: slot.trainer.id,
            name: slot.trainer.name,
            imageUrl: uploadReferenceUrl(this.publicBase(), slot.trainer.image_url),
            rating: toNum(slot.trainer.rating_avg),
          },
        ] as const),
      ).values(),
    ];

    const singleSessionPrice = toNum(classType.single_session_price);
    return {
      classTypeId: classType.id,
      name: classType.name,
      color: classType.color || DEFAULT_CLASS_COLOR,
      sessionsCount: classType.subscription_sessions_count,
      validityDays: classType.subscription_validity_days,
      singleSessionPrice,
      price: roundMoney(singleSessionPrice * classType.subscription_sessions_count),
      trainers,
      slots: liveSlots.map((slot) => ({
        weekday: slot.weekday,
        dayNameAr: AR_WEEKDAYS[slot.weekday] ?? String(slot.weekday),
        startTime: slot.start_time,
        endTime: slot.end_time,
        trainerId: slot.trainer_id,
        trainerName: slot.trainer?.name ?? null,
        hallName: slot.hall?.name ?? null,
        maxCapacity: slot.max_capacity,
        audience: slot.audience,
        audienceLabel: AUDIENCE_LABELS[slot.audience],
      })),
    };
  }

  // ── Attendance history / streak (سجل الحضور) ────────────────────────────────

  private attendanceDateOrDefault(value: string | undefined, fallback: string): string {
    const requested = value?.trim();
    if (!requested?.length) return fallback;
    if (!isIsoDate(requested)) {
      throw new BadRequestException('صيغة التاريخ غير صحيحة، استخدم YYYY-MM-DD');
    }
    return requested;
  }

  /**
   * Real gym check-ins behind the mobile streak card.
   *
   * Deliberately NOT branch-scoped: `club_attendance.branch_id` is a snapshot of where the member
   * checked in, and the streak belongs to this membership row (`member_id` from the JWT), so every
   * row of theirs counts. Every `ClubAttendanceStatus` is a real visit, so there is no status filter.
   */
  async getAttendance(memberId: number, from?: string, to?: string) {
    const today = localDateString();
    const toDate = this.attendanceDateOrDefault(to, today);
    const fromDate = this.attendanceDateOrDefault(from, shiftIsoDate(toDate, -(ATTENDANCE_WINDOW_DAYS - 1)));
    if (fromDate > toDate) {
      throw new BadRequestException('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    const rows = await this.prisma.club_attendance.findMany({
      where: { member_id: memberId, attendance_date: { gte: fromDate, lte: toDate } },
      select: { attendance_date: true },
      orderBy: { attendance_date: 'asc' },
    });

    // Two check-ins on one day are one visit day, so de-duplicate before counting or streaking.
    const days = Array.from(new Set(rows.map((row) => row.attendance_date))).sort();

    return {
      from: fromDate,
      to: toDate,
      days,
      totalVisits: days.length,
      ...computeAttendanceStreak(days, today),
    };
  }

  // ── Points log (سجل النقاط) ─────────────────────────────────────────────────

  /**
   * Simple v1 points log DERIVED from subscriptions: each subscription earns the wallet_points
   * configured on its package ("نقاط المحفظة"). No ledger table yet, so there is no redemption —
   * balance == total earned. Meant to be swapped for a real earn/redeem ledger later.
   */
  async listPoints(memberId: number) {
    const subs = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId },
      orderBy: [{ registration_date: 'asc' }, { id: 'asc' }],
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
          type: 'earn' as const,
          points: e.points,
          balanceAfter: running,
          reason: e.s.subscription_type ?? e.s.type?.name ?? 'اشتراك',
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
