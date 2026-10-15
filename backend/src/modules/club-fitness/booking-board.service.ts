import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubClassesService } from './club-classes.service';
import { localDateString, toNum } from './club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap } from '../club-members/club-member-brief.utils';
import { isCalendarDate } from '../../common/validators';

/**
 * The reception/branch-manager booking board: one day, captains as columns, the clock as rows.
 *
 * It answers the two questions a front desk actually asks — "who is busy right now?" and
 * "where is the first free slot?" — by merging two sources that already exist:
 *   - `club_classes`        → the real dated sessions, with everyone enrolled in them
 *   - `club_trainer_schedule_slots` → each captain's weekly template, i.e. the times they work
 *
 * A template slot with no overlapping session that day is an OPEN slot: booking it creates the
 * session on the spot. A session with seats left is still bookable, which is how one 8:00 cell
 * ends up holding two or three clients.
 */

/** Board window floor/ceiling — widened (never narrowed) by the day's real data. */
const DEFAULT_DAY_START_MINUTES = 8 * 60;
const DEFAULT_DAY_END_MINUTES = 22 * 60;
const SLOT_MINUTES = 30;
const BOOKING_SOURCE = 'booking_board';

function toMinutes(value: string | null | undefined): number {
  const [hours, minutes] = String(value ?? '').split(':');
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function fromMinutes(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** Normalize DB `VarChar(8)` times (`08:00:00`) to the `HH:MM` the UI grid works in. */
function hhmm(value: string | null | undefined): string {
  return fromMinutes(toMinutes(value));
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

export interface DayBoardQuery {
  date: string;
  branchId?: number;
  classTypeId?: number;
  trainerId?: number;
  /** Also list active captains who have no session and no template slot that day. */
  showIdle?: boolean;
}

export interface QuickBookBody {
  memberId: number;
  /** Book into an existing session… */
  classId?: number;
  /** …or materialize an open slot (or a free-hand time) into a session, then book it. */
  slot?: {
    trainerId: number;
    branchId: number;
    date: string;
    startTime: string;
    endTime: string;
    classTypeId?: number | null;
    hallId?: number | null;
    templateSlotId?: number | null;
    maxCapacity?: number | null;
    price?: number | null;
    className?: string | null;
  };
  waitlistIfFull?: boolean;
  force?: boolean;
  subscriptionId?: number;
}

type BoardMember = {
  memberId: number;
  memberName: string | null;
  memberCode: string | null;
  memberPhone: string | null;
  memberGender: string | null;
  memberProfilePicture: string | null;
  attendanceStatus: string;
  bookingSource: string;
};

type BoardEntry = {
  kind: 'booked' | 'free';
  startTime: string;
  endTime: string;
  durationMinutes: number;
  branchId: number;
  classTypeId: number | null;
  className: string;
  color: string;
  hallId: number | null;
  hallName: string | null;
  maxCapacity: number;
  enrollmentCount: number;
  remainingSeats: number;
  bookable: boolean;
  price: number;
  /** booked entries only */
  classId?: number;
  status?: string;
  members?: BoardMember[];
  /** free entries only */
  templateSlotId?: number;
};

@Injectable()
export class BookingBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly classes: ClubClassesService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private static assertDate(value: string | undefined): string {
    const date = String(value ?? '');
    if (!isCalendarDate(date)) {
      throw new BadRequestException('تاريخ غير صالح');
    }
    return date;
  }

  async day(query: DayBoardQuery, user?: JwtUser) {
    const date = BookingBoardService.assertDate(query.date);
    if (query.branchId) this.assertBranchAccess(user, query.branchId);

    // Read across the user's whole scope once: the board needs per-branch totals for the tree
    // even while it renders a single branch.
    const allowed = this.branchScope.allowedBranchIds(user);
    const branchWhere = allowed === null ? {} : { branch_id: { in: allowed } };
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const today = localDateString();
    const isPastDate = date < today;

    const [classRows, slotRows, branchRows] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          is_deleted: false,
          class_date: date,
          ...branchWhere,
          ...(query.trainerId ? { trainer_id: query.trainerId } : {}),
          ...(query.classTypeId ? { class_type_id: query.classTypeId } : {}),
        },
        include: {
          trainer: { select: { id: true, name: true, image_url: true, specialization: true } },
          hall: { select: { id: true, name: true } },
          class_type: { select: { id: true, name: true, color: true } },
          enrollments: {
            where: { attendance_status: { not: 'cancelled' } },
            select: { member_id: true, attendance_status: true, booking_source: true },
          },
        },
        orderBy: [{ start_time: 'asc' }],
      }),
      this.prisma.club_trainer_schedule_slots.findMany({
        where: {
          is_active: true,
          weekday,
          ...branchWhere,
          ...(query.trainerId ? { trainer_id: query.trainerId } : {}),
          ...(query.classTypeId ? { class_type_id: query.classTypeId } : {}),
          trainer: { is_deleted: false },
          class_type: { is_deleted: false, is_active: true },
        },
        include: {
          trainer: { select: { id: true, name: true, image_url: true, specialization: true } },
          hall: { select: { id: true, name: true } },
          class_type: { select: { id: true, name: true, color: true, single_session_price: true } },
        },
        orderBy: [{ start_time: 'asc' }],
      }),
      this.prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' } }),
    ]);

    const memberMap = await loadMemberBriefMap(
      this.prisma,
      classRows.flatMap((row) => row.enrollments.map((e) => e.member_id)),
    );

    // An open slot is a template slot with nothing of that captain's overlapping it that day.
    const classesByTrainer = new Map<number, typeof classRows>();
    for (const row of classRows) {
      const list = classesByTrainer.get(row.trainer_id) ?? [];
      list.push(row);
      classesByTrainer.set(row.trainer_id, list);
    }
    const openSlots = slotRows.filter((slot) => {
      const start = hhmm(slot.start_time);
      const end = hhmm(slot.end_time);
      // No branch comparison on purpose: a captain teaching in another branch at that hour is
      // busy, so the slot is not open.
      return !(classesByTrainer.get(slot.trainer_id) ?? []).some((cls) =>
        cls.status !== 'cancelled'
        && overlaps(start, end, hhmm(cls.start_time), hhmm(cls.end_time)),
      );
    });

    const branchNames = new Map(branchRows.map((b) => [b.branch_id, b.branch_name ?? `#${b.branch_id}`]));
    const branchIds = [...new Set([
      ...classRows.map((r) => r.branch_id),
      ...openSlots.map((s) => s.branch_id),
      ...(allowed ?? branchRows.map((b) => b.branch_id)),
    ])].filter((id) => allowed === null || allowed.includes(id));

    const branches = branchIds
      .map((branchId) => {
        const dayClasses = classRows.filter((r) => r.branch_id === branchId && r.status !== 'cancelled');
        const dayOpen = openSlots.filter((s) => s.branch_id === branchId);
        return {
          branchId,
          branchName: branchNames.get(branchId) ?? `#${branchId}`,
          parentId: branchRows.find((b) => b.branch_id === branchId)?.from_id ?? 0,
          bookedSessions: dayClasses.length,
          freeSlots: dayOpen.length,
          bookedSeats: dayClasses.reduce((sum, r) => sum + r.enrollments.length, 0),
          trainers: new Set([
            ...dayClasses.map((r) => r.trainer_id),
            ...dayOpen.map((s) => s.trainer_id),
          ]).size,
        };
      })
      .sort((a, b) => a.branchId - b.branchId);

    // Now narrow to the branch actually being viewed.
    const visibleClasses = query.branchId ? classRows.filter((r) => r.branch_id === query.branchId) : classRows;
    const visibleOpen = query.branchId ? openSlots.filter((s) => s.branch_id === query.branchId) : openSlots;

    const trainers = new Map<number, { trainerId: number; trainerName: string; imageUrl: string | null; specialization: string | null; entries: BoardEntry[] }>();
    const ensureTrainer = (trainer: { id: number; name: string; image_url: string | null; specialization: string | null }) => {
      const existing = trainers.get(trainer.id);
      if (existing) return existing;
      const created = {
        trainerId: trainer.id,
        trainerName: trainer.name,
        imageUrl: trainer.image_url,
        specialization: trainer.specialization,
        entries: [] as BoardEntry[],
      };
      trainers.set(trainer.id, created);
      return created;
    };

    for (const row of visibleClasses) {
      const startTime = hhmm(row.start_time);
      const endTime = hhmm(row.end_time);
      const enrollmentCount = row.enrollments.length;
      const remainingSeats = Math.max(0, row.max_capacity - enrollmentCount);
      ensureTrainer(row.trainer).entries.push({
        kind: 'booked',
        classId: row.id,
        startTime,
        endTime,
        durationMinutes: Math.max(SLOT_MINUTES, toMinutes(endTime) - toMinutes(startTime)),
        branchId: row.branch_id,
        classTypeId: row.class_type_id,
        className: row.class_name,
        color: row.class_type?.color ?? '#2563EB',
        hallId: row.hall_id,
        hallName: row.hall?.name ?? null,
        maxCapacity: row.max_capacity,
        enrollmentCount,
        remainingSeats,
        bookable: !isPastDate && row.status !== 'cancelled' && remainingSeats > 0,
        price: toNum(row.price),
        status: row.status,
        members: row.enrollments.map((enrollment) => ({
          memberId: enrollment.member_id,
          ...attachMemberBrief(enrollment.member_id, memberMap),
          attendanceStatus: enrollment.attendance_status,
          bookingSource: enrollment.booking_source,
        })),
      });
    }

    for (const slot of visibleOpen) {
      const startTime = hhmm(slot.start_time);
      const endTime = hhmm(slot.end_time);
      ensureTrainer(slot.trainer).entries.push({
        kind: 'free',
        templateSlotId: slot.id,
        startTime,
        endTime,
        durationMinutes: Math.max(SLOT_MINUTES, toMinutes(endTime) - toMinutes(startTime)),
        branchId: slot.branch_id,
        classTypeId: slot.class_type_id,
        className: slot.class_type.name,
        color: slot.class_type.color,
        hallId: slot.hall_id,
        hallName: slot.hall?.name ?? null,
        maxCapacity: slot.max_capacity,
        enrollmentCount: 0,
        remainingSeats: slot.max_capacity,
        bookable: !isPastDate,
        price: toNum(slot.class_type.single_session_price),
      });
    }

    if (query.showIdle) {
      const idle = await this.prisma.club_trainers.findMany({
        where: {
          is_deleted: false,
          is_active: true,
          id: query.trainerId
            ? { equals: query.trainerId, notIn: [...trainers.keys()] }
            : { notIn: [...trainers.keys()] },
        },
        select: { id: true, name: true, image_url: true, specialization: true },
        orderBy: { name: 'asc' },
      });
      idle.forEach(ensureTrainer);
    }

    const rows = [...trainers.values()]
      .map((trainer) => {
        const entries = trainer.entries.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
        const booked = entries.filter((e) => e.kind === 'booked' && e.status !== 'cancelled');
        const free = entries.filter((e) => e.kind === 'free');
        return {
          ...trainer,
          entries,
          bookedSessions: booked.length,
          freeSlots: free.length,
          bookedSeats: booked.reduce((sum, e) => sum + e.enrollmentCount, 0),
          capacity: entries.reduce((sum, e) => sum + e.maxCapacity, 0),
          firstFreeTime: free.find((e) => e.bookable)?.startTime
            ?? booked.find((e) => e.bookable)?.startTime
            ?? null,
        };
      })
      .sort((a, b) => a.trainerName.localeCompare(b.trainerName, 'ar'));

    const allEntries = rows.flatMap((row) => row.entries);
    const startMinutes = Math.min(
      DEFAULT_DAY_START_MINUTES,
      ...allEntries.map((entry) => Math.floor(toMinutes(entry.startTime) / 60) * 60),
    );
    const endMinutes = Math.max(
      DEFAULT_DAY_END_MINUTES,
      ...allEntries.map((entry) => Math.ceil(toMinutes(entry.endTime) / 60) * 60),
    );

    return {
      date,
      weekday,
      isPastDate,
      axis: {
        startTime: fromMinutes(startMinutes),
        endTime: fromMinutes(endMinutes),
        slotMinutes: SLOT_MINUTES,
      },
      branches,
      trainers: rows,
      summary: {
        trainers: rows.length,
        bookedSessions: rows.reduce((sum, row) => sum + row.bookedSessions, 0),
        freeSlots: rows.reduce((sum, row) => sum + row.freeSlots, 0),
        bookedSeats: rows.reduce((sum, row) => sum + row.bookedSeats, 0),
        capacity: rows.reduce((sum, row) => sum + row.capacity, 0),
      },
    };
  }

  /**
   * One click from the board: put a client in a cell.
   *
   * An existing session is just an enrollment. An open slot has no session yet, so one is created
   * first — and rolled back if the enrollment is then rejected (unpaid dues, wrong package, full),
   * so a refused booking never leaves a phantom session behind on the board.
   */
  async quickBook(body: QuickBookBody, user?: JwtUser) {
    const memberId = Number(body.memberId);
    if (!memberId) throw new BadRequestException('اختر العميل أولًا');

    if (body.classId) {
      const result = await this.classes.enrollMember(Number(body.classId), memberId, {
        waitlistIfFull: body.waitlistIfFull,
        force: body.force,
        bookingSource: BOOKING_SOURCE,
        subscriptionId: body.subscriptionId,
      }, user);
      return { classId: Number(body.classId), createdSession: false, result };
    }

    const slot = body.slot;
    if (!slot) throw new BadRequestException('اختر الميعاد أولًا');
    const date = BookingBoardService.assertDate(slot.date);
    const branchId = Number(slot.branchId);
    const trainerId = Number(slot.trainerId);
    if (!branchId || !trainerId) throw new BadRequestException('الكابتن والفرع مطلوبان');
    this.assertBranchAccess(user, branchId);

    let classType: { id: number; name: string } | null = null;
    if (slot.classTypeId) {
      classType = await this.prisma.club_class_types.findFirst({
        where: { id: Number(slot.classTypeId), is_deleted: false, is_active: true },
        select: { id: true, name: true },
      });
      if (!classType) throw new NotFoundException('نوع الحصة غير موجود');
    }
    const className = classType?.name ?? String(slot.className ?? '').trim();
    if (!className) throw new BadRequestException('اسم الحصة مطلوب');

    const created = await this.classes.create({
      classTypeId: classType?.id ?? undefined,
      className,
      trainerId,
      branchId,
      hallId: slot.hallId ?? undefined,
      classDate: date,
      startTime: hhmm(slot.startTime),
      endTime: hhmm(slot.endTime),
      maxCapacity: slot.maxCapacity ?? undefined,
      price: slot.price ?? undefined,
      trainerScheduleSlotId: slot.templateSlotId ?? undefined,
    }, user);

    try {
      const result = await this.classes.enrollMember(created.id, memberId, {
        waitlistIfFull: body.waitlistIfFull,
        force: body.force,
        bookingSource: BOOKING_SOURCE,
        subscriptionId: body.subscriptionId,
      }, user);
      return { classId: created.id, createdSession: true, result };
    } catch (error) {
      // Another desk may have booked the newly-created session while this enrollment failed.
      // Share the enrollment lock and remove only a session that is still empty.
      await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM club_classes WHERE id = ${created.id} FOR UPDATE`;
        const enrolled = await tx.club_class_enrollments.count({
          where: { class_id: created.id, attendance_status: { not: 'cancelled' } },
        });
        if (enrolled === 0) await tx.club_classes.update({ where: { id: created.id }, data: { is_deleted: true } });
      }).catch(() => undefined);
      throw error;
    }
  }

  /** Remove a client from a cell. Empties left behind stay as an open session, not an open slot. */
  async cancelBooking(classId: number, memberId: number, user?: JwtUser) {
    return this.classes.unenrollMember(Number(classId), Number(memberId), user);
  }
}
