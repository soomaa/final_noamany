import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { csvRows } from '../../common/export/csv.util';

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

@Injectable()
export class ClubCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  async listEvents(
    query: { from: string; to: string; branchId?: number; trainerId?: number },
    user?: JwtUser,
  ) {
    if (query.branchId) this.assertBranchAccess(user, query.branchId);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const where: Prisma.club_classesWhereInput = {
      is_deleted: false,
      class_date: { gte: query.from, lte: query.to },
      ...(query.branchId ? { branch_id: query.branchId } : {}),
      ...(scope !== null ? { branch_id: { in: scope } } : {}),
      ...(query.trainerId ? { trainer_id: query.trainerId } : {}),
    };

    const rows = await this.prisma.club_classes.findMany({
      where,
      include: {
        trainer: { select: { id: true, name: true } },
        hall: { select: { id: true, name: true, hall_number: true } },
        class_type: { select: { id: true, name: true, color: true } },
        enrollments: { where: { attendance_status: { not: 'cancelled' } }, select: { id: true } },
      },
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
    });

    const classRows = rows.map((r) => ({
      sourceType: 'class' as const,
      id: r.id,
      title: r.class_name,
      classTypeId: r.class_type_id,
      color: r.class_type?.color ?? '#2563EB',
      date: r.class_date,
      startTime: r.start_time,
      endTime: r.end_time,
      trainerId: r.trainer_id,
      trainerName: r.trainer.name,
      branchId: r.branch_id,
      hallId: r.hall_id,
      hallName: r.hall?.name ?? null,
      maxCapacity: r.max_capacity,
      enrollmentCount: r.enrollments.length,
      status: r.status,
      cancelledReason: r.cancelled_reason,
      price: Number(r.price),
    }));

    // Additive: also surface club_event_sessions (Phase 1 events) on the same calendar,
    // discriminated by sourceType so existing class-only callers can filter them out.
    const eventSessionRows = await this.prisma.club_event_sessions.findMany({
      where: {
        session_date: { gte: query.from, lte: query.to },
        ...(query.trainerId ? { trainer_id: query.trainerId } : {}),
        ...(query.branchId ? { event: { branch_id: query.branchId } } : {}),
        ...(scope !== null ? { event: { branch_id: { in: scope } } } : {}),
      },
      include: {
        event: { select: { id: true, title: true, branch_id: true, max_capacity: true } },
        _count: { select: { checkins: true } },
      },
      orderBy: [{ session_date: 'asc' }, { start_time: 'asc' }],
    });

    const eventRows = eventSessionRows.map((s) => ({
      sourceType: 'event' as const,
      id: s.id,
      title: s.title ?? s.event.title,
      date: s.session_date,
      startTime: s.start_time,
      endTime: s.end_time,
      trainerId: s.trainer_id,
      trainerName: null as string | null,
      branchId: s.event.branch_id,
      hallId: s.hall_id,
      hallName: null as string | null,
      maxCapacity: s.max_capacity ?? s.event.max_capacity,
      enrollmentCount: s._count.checkins,
      status: s.status,
      price: 0,
      eventId: s.event_id,
    }));

    return [...classRows, ...eventRows];
  }

  async detectConflicts(body: {
    classDate: string;
    startTime: string;
    endTime: string;
    trainerId?: number;
    hallId?: number;
    branchId?: number;
    excludeClassId?: number;
  }, user?: JwtUser) {
    if (body.branchId) this.assertBranchAccess(user, body.branchId);
    const scope = this.branchScope.resolveListFilter(user, body.branchId ?? null);
    const conflicts: Array<{ type: string; classId: number; className: string; date: string; startTime: string; endTime: string }> = [];

    const baseWhere: Prisma.club_classesWhereInput = {
      is_deleted: false,
      class_date: body.classDate,
      ...(body.excludeClassId ? { id: { not: body.excludeClassId } } : {}),
      ...(body.branchId ? { branch_id: body.branchId } : {}),
      ...(scope !== null ? { branch_id: { in: scope } } : {}),
    };

    const sameDay = await this.prisma.club_classes.findMany({
      where: baseWhere,
      select: { id: true, class_name: true, class_date: true, start_time: true, end_time: true, trainer_id: true, hall_id: true },
    });

    for (const c of sameDay) {
      if (!overlaps(body.startTime, body.endTime, c.start_time, c.end_time)) continue;
      if (body.trainerId && c.trainer_id === body.trainerId) {
        conflicts.push({ type: 'trainer', classId: c.id, className: c.class_name, date: c.class_date, startTime: c.start_time, endTime: c.end_time });
      }
      if (body.hallId && c.hall_id === body.hallId) {
        conflicts.push({ type: 'hall', classId: c.id, className: c.class_name, date: c.class_date, startTime: c.start_time, endTime: c.end_time });
      }
    }

    // Additive: also scan hall bookings (status != cancelled) for hall_id overlaps — a hall
    // reserved via club_hall_bookings should block scheduling a class/event in the same slot.
    if (body.hallId) {
      const hallBookings = await this.prisma.club_hall_bookings.findMany({
        where: {
          is_deleted: false,
          hall_id: body.hallId,
          booking_date: body.classDate,
          status: { not: 'cancelled' },
          ...(scope !== null ? { hall: { branch_id: { in: scope } } } : {}),
        },
        select: { id: true, booking_date: true, start_time: true, end_time: true, customer_name: true },
      });

      for (const b of hallBookings) {
        if (!overlaps(body.startTime, body.endTime, b.start_time, b.end_time)) continue;
        conflicts.push({
          type: 'hall',
          classId: b.id,
          className: b.customer_name ?? 'حجز قاعة',
          date: b.booking_date,
          startTime: b.start_time,
          endTime: b.end_time,
        });
      }
    }

    return { hasConflict: conflicts.length > 0, conflicts };
  }

  async moveClass(
    id: number,
    body: { classDate?: string; startTime?: string; endTime?: string; hallId?: number | null },
    user?: JwtUser,
  ) {
    const existing = await this.prisma.club_classes.findFirst({ where: { id, is_deleted: false } });
    if (!existing) throw new NotFoundException('الحصة غير موجودة');
    this.assertBranchAccess(user, existing.branch_id);

    const classDate = body.classDate ?? existing.class_date;
    const startTime = body.startTime ?? existing.start_time;
    const endTime = body.endTime ?? existing.end_time;
    const hallId = body.hallId !== undefined ? body.hallId : existing.hall_id;

    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new BadRequestException('وقت البداية يجب أن يكون قبل وقت النهاية');
    }

    const { hasConflict, conflicts } = await this.detectConflicts({
      classDate,
      startTime,
      endTime,
      trainerId: existing.trainer_id,
      hallId: hallId ?? undefined,
      branchId: existing.branch_id,
      excludeClassId: id,
    });

    if (hasConflict) {
      throw new BadRequestException({
        message: 'تعارض في الجدول — المدرب أو القاعة محجوزان في هذا الوقت',
        conflicts,
      });
    }

    const row = await this.prisma.club_classes.update({
      where: { id },
      data: {
        class_date: classDate,
        start_time: startTime,
        end_time: endTime,
        ...(body.hallId !== undefined ? { hall_id: body.hallId } : {}),
      },
      include: { trainer: { select: { id: true, name: true } }, hall: { select: { id: true, name: true } } },
    });

    return {
      id: row.id,
      classDate: row.class_date,
      startTime: row.start_time,
      endTime: row.end_time,
      hallId: row.hall_id,
      trainerName: row.trainer.name,
      hallName: row.hall?.name ?? null,
    };
  }

  async createRecurring(body: {
    className: string;
    trainerId: number;
    branchId: number;
    hallId?: number;
    startDate: string;
    weeks: number;
    weekdays: number[];
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    price?: number;
  }, user?: JwtUser) {
    this.assertBranchAccess(user, body.branchId);
    if (!body.weekdays.length) throw new BadRequestException('اختر يوماً واحداً على الأقل');
    if (body.weeks < 1 || body.weeks > 52) throw new BadRequestException('عدد الأسابيع يجب أن يكون بين 1 و 52');

    const created: number[] = [];
    const start = new Date(`${body.startDate}T12:00:00`);

    for (let w = 0; w < body.weeks; w++) {
      for (const wd of body.weekdays) {
        const d = new Date(start);
        d.setDate(d.getDate() + w * 7 + ((wd - d.getDay() + 7) % 7));
        const classDate = d.toISOString().slice(0, 10);
        if (classDate < body.startDate) continue;

        const { hasConflict } = await this.detectConflicts({
          classDate,
          startTime: body.startTime,
          endTime: body.endTime,
          trainerId: body.trainerId,
          hallId: body.hallId,
          branchId: body.branchId,
        });
        if (hasConflict) continue;

        const row = await this.prisma.club_classes.create({
          data: {
            class_name: body.className,
            trainer_id: body.trainerId,
            branch_id: body.branchId,
            hall_id: body.hallId ?? null,
            class_date: classDate,
            start_time: body.startTime,
            end_time: body.endTime,
            max_capacity: body.maxCapacity ?? 10,
            price: body.price ?? 0,
          },
        });
        created.push(row.id);
      }
    }

    return { createdCount: created.length, classIds: created };
  }

  /** Quick export helper for backup UI */
  async exportMembersCsv(branchId?: number, user?: JwtUser): Promise<string> {
    if (branchId) this.assertBranchAccess(user, branchId);
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    const gender = this.branchScope.memberGenderFilter(user);
    const rows = await this.prisma.club_members.findMany({
      where: {
        is_deleted: false,
        ...(branchId ? { branch_id: branchId } : {}),
        ...(scope !== null ? { branch_id: { in: scope } } : {}),
        ...(gender ? { gender } : {}),
      },
      orderBy: { id: 'asc' },
      select: {
        member_code: true,
        name: true,
        phone: true,
        email: true,
        gender: true,
        card_number: true,
        branch_id: true,
        is_active: true,
        created_at: true,
      },
    });

    return csvRows([
      ['member_code', 'name', 'phone', 'email', 'gender', 'card_number', 'branch_id', 'is_active', 'created_at'],
      ...rows.map((r) => [
        r.member_code,
        r.name,
        r.phone ?? '',
        r.email ?? '',
        r.gender,
        r.card_number ?? '',
        r.branch_id,
        r.is_active,
        r.created_at.toISOString(),
      ]),
    ]);
  }

  async exportSubscriptionsCsv(branchId?: number, user?: JwtUser): Promise<string> {
    if (branchId) this.assertBranchAccess(user, branchId);
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    const gender = this.branchScope.memberGenderFilter(user);
    const rows = await this.prisma.club_subscriptions.findMany({
      where: {
        ...(branchId ? { branch_id: branchId } : {}),
        ...(scope !== null ? { branch_id: { in: scope } } : {}),
        ...(gender ? { gender } : {}),
      },
      orderBy: { id: 'desc' },
      take: 10_000,
      select: {
        subscription_number: true,
        customer_name: true,
        subscription_type: true,
        subscription_start_date: true,
        subscription_end_date: true,
        subscription_value: true,
        paid_amount: true,
        remaining_amount: true,
        status: true,
        branch_id: true,
      },
    });

    return csvRows([
      ['subscription_number', 'customer_name', 'subscription_type', 'start_date', 'end_date', 'value', 'paid', 'remaining', 'status', 'branch_id'],
      ...rows.map((r) => [
        r.subscription_number,
        r.customer_name ?? '',
        r.subscription_type ?? '',
        r.subscription_start_date,
        r.subscription_end_date,
        Number(r.subscription_value),
        Number(r.paid_amount),
        Number(r.remaining_amount),
        r.status,
        r.branch_id,
      ]),
    ]);
  }
}
