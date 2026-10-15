import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubMembersService } from '../club-members/club-members.service';
import { ScanClubEventCheckinDto, MemberClubEventCheckinDto } from './dto/scan-club-event-checkin.dto';
import { toNum } from './club-events.utils';
import { attachMemberBrief, loadMemberBriefMap } from '../club-members/club-member-brief.utils';

/**
 * Check-in time-window tolerance: from 2 hours before the session/event start until 2 hours after
 * its end (or the whole event day if no start/end time is set). Deliberately loose — walk-ins,
 * early arrivals and staff running check-in past the official end time are normal at in-person
 * events, and being overly strict here just generates support tickets. Revisit if abuse is seen.
 */
const WINDOW_BEFORE_MS = 2 * 3600_000;
const WINDOW_AFTER_MS = 2 * 3600_000;

@Injectable()
export class ClubEventCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
    private readonly audit: BusinessAuditService,
  ) {}

  private mapCheckin(c: {
    id: number;
    registration_id: number;
    event_id: number;
    session_id: number | null;
    method: string;
    checked_in_at: Date;
    checked_by: number | null;
  }) {
    return {
      id: c.id,
      registrationId: c.registration_id,
      eventId: c.event_id,
      sessionId: c.session_id,
      method: c.method,
      checkedInAt: c.checked_in_at,
      checkedBy: c.checked_by,
    };
  }

  private buildDateTime(dateStr: string, timeStr: string | null): Date | null {
    if (!timeStr) return null;
    return new Date(`${dateStr}T${timeStr.length === 5 ? `${timeStr}:00` : timeStr}`);
  }

  private async assertWithinWindow(
    event: { start_date: string; end_date: string; start_time: string | null; end_time: string | null },
    session: { session_date: string; start_time: string; end_time: string } | null,
    at: Date,
  ) {
    const dateStr = session?.session_date ?? event.start_date;
    const startTimeStr = session?.start_time ?? event.start_time;
    const endDateStr = session ? session.session_date : event.end_date;
    const endTimeStr = session?.end_time ?? event.end_time;

    const start = this.buildDateTime(dateStr, startTimeStr ?? null);
    const end = this.buildDateTime(endDateStr, endTimeStr ?? null);

    if (start) {
      const windowStart = new Date(start.getTime() - WINDOW_BEFORE_MS);
      if (at < windowStart) {
        throw new BadRequestException('لم يحن وقت تسجيل الحضور بعد');
      }
    }
    if (end) {
      const windowEnd = new Date(end.getTime() + WINDOW_AFTER_MS);
      if (at > windowEnd) {
        throw new BadRequestException('انتهى وقت تسجيل الحضور لهذه الفعالية/الجلسة');
      }
    } else if (!start) {
      // Neither event nor session carries time-of-day info — fall back to date-only bounds so we
      // still block check-in outside the event's calendar date range.
      const today = dateStr;
      if (today < event.start_date || today > event.end_date) {
        throw new BadRequestException('التاريخ خارج نطاق الفعالية');
      }
    }
  }

  private async resolveAndValidate(
    registrationId: number,
    eventId: number,
    sessionId: number | undefined,
    method: 'qr' | 'member_code' | 'manual',
    checkedBy?: number,
    options?: { liveSelfCheckin?: boolean },
  ) {
    const liveSelfCheckin = options?.liveSelfCheckin ?? false;
    const registration = await this.prisma.club_event_registrations.findFirst({
      where: { id: registrationId, is_deleted: false },
    });
    if (!registration) throw new NotFoundException('التسجيل غير موجود');
    if (registration.event_id !== eventId) {
      throw new BadRequestException('التسجيل لا يخص هذه الفعالية');
    }
    if (!liveSelfCheckin && registration.status !== 'confirmed') {
      throw new BadRequestException('التسجيل غير مؤكد — لا يمكن تسجيل الحضور');
    }
    if (liveSelfCheckin && !['confirmed', 'pending_payment'].includes(registration.status)) {
      throw new BadRequestException('التسجيل غير مؤكد — لا يمكن تسجيل الحضور');
    }

    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    const allowedStatuses: readonly string[] = liveSelfCheckin
      ? ['approved', 'published', 'ongoing']
      : ['published', 'ongoing'];
    if (!allowedStatuses.includes(event.status)) {
      throw new BadRequestException('تسجيل الحضور غير متاح لهذه الفعالية في حالتها الحالية');
    }

    if (!liveSelfCheckin && event.requires_guardian_consent && !registration.consent_signed) {
      throw new BadRequestException('يجب توقيع إقرار ولي الأمر قبل تسجيل الحضور');
    }

    let session: { id: number; session_date: string; start_time: string; end_time: string } | null = null;
    if (sessionId) {
      session = await this.prisma.club_event_sessions.findFirst({
        where: { id: sessionId, event_id: eventId },
      });
      if (!session) throw new NotFoundException('الجلسة غير موجودة');
    }

    await this.assertWithinWindow(event, session, new Date());

    const checkin = await this.prisma.$transaction(async (tx) => {
      // Serialize dedup-check + insert behind a MySQL named lock (same GET_LOCK/RELEASE_LOCK
      // pattern used elsewhere in club-events for check-then-write races): the DB
      // @@unique(registration_id, session_id) only protects the session_id-given case reliably
      // (MySQL treats NULL as distinct in unique indexes), so for session_id NULL we must
      // explicitly check first — and a plain read inside the transaction alone does not prevent
      // two concurrent check-in transactions from both observing "not found" under InnoDB's
      // default REPEATABLE READ.
      const lockName = `club_event_checkin_${registrationId}`;
      await tx.$queryRaw`SELECT GET_LOCK(${lockName}, 10)`;
      try {
        const existing = await tx.club_event_checkins.findFirst({
          where: { registration_id: registrationId, session_id: sessionId ?? null },
        });
        if (existing) {
          throw new ConflictException('تم تسجيل الحضور لهذا التسجيل من قبل');
        }

        const created = await tx.club_event_checkins.create({
          data: {
            registration_id: registrationId,
            event_id: eventId,
            session_id: sessionId ?? null,
            method,
            checked_by: checkedBy ?? null,
          },
        });
        await tx.club_events.update({
          where: { id: eventId },
          data: { attended_count: { increment: 1 } },
        });
        return created;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
      }
    });

    await this.audit.log({
      entityType: 'club_event_checkin',
      entityId: checkin.id,
      action: 'check_in',
      actorUserId: checkedBy,
      branchId: registration.branch_id,
      after: { registrationId, eventId, sessionId: sessionId ?? null, method },
    });

    return this.mapCheckin(checkin);
  }

  async scan(dto: ScanClubEventCheckinDto, checkedBy?: number) {
    const registration = await this.prisma.club_event_registrations.findFirst({
      where: { checkin_code: dto.code, is_deleted: false },
    });
    if (!registration) throw new NotFoundException('كود الدخول غير صالح');

    const checkin = await this.resolveAndValidate(registration.id, dto.eventId, dto.sessionId, 'qr', checkedBy);

    const memberMap = await loadMemberBriefMap(this.prisma, [registration.member_id]);
    const brief = attachMemberBrief(registration.member_id, memberMap);

    return {
      ...checkin,
      registrationNumber: registration.registration_number,
      name:
        registration.registrant_type === 'guest'
          ? registration.guest_name
          : brief.memberName,
      phone: registration.guest_phone ?? brief.memberPhone ?? null,
      registrantType: registration.registrant_type,
    };
  }

  async byMember(dto: MemberClubEventCheckinDto, checkedBy?: number) {
    const member = await this.members.resolveByIdOrCode(undefined, dto.memberCode);

    const registration = await this.prisma.club_event_registrations.findFirst({
      where: { event_id: dto.eventId, member_id: member.id, is_deleted: false, status: 'confirmed' },
      orderBy: { id: 'desc' },
    });
    if (!registration) throw new NotFoundException('لا يوجد تسجيل مؤكد لهذا العضو في هذه الفعالية');

    return this.resolveAndValidate(registration.id, dto.eventId, dto.sessionId, 'member_code', checkedBy);
  }

  async manual(registrationId: number, eventId: number, sessionId: number | undefined, checkedBy?: number) {
    return this.resolveAndValidate(registrationId, eventId, sessionId, 'manual', checkedBy);
  }

  async liveGuest(
    registrationId: number,
    eventId: number,
    method: 'qr' | 'manual',
    checkedBy?: number,
  ) {
    return this.resolveAndValidate(registrationId, eventId, undefined, method, checkedBy, {
      liveSelfCheckin: true,
    });
  }

  async roster(eventId: number) {
    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    const [registrations, sessions] = await Promise.all([
      this.prisma.club_event_registrations.findMany({
        where: { event_id: eventId, is_deleted: false, status: { not: 'cancelled' } },
        include: { checkins: true },
        orderBy: { id: 'asc' },
      }),
      this.prisma.club_event_sessions.findMany({
        where: { event_id: eventId },
        orderBy: [{ session_date: 'asc' }, { order_index: 'asc' }],
      }),
    ]);

    const memberMap = await loadMemberBriefMap(this.prisma, registrations.map((r) => r.member_id));

    const roster = registrations.map((r) => ({
      registrationId: r.id,
      registrationNumber: r.registration_number,
      registrantType: r.registrant_type,
      memberId: r.member_id,
      ...attachMemberBrief(r.member_id, memberMap),
      guestName: r.guest_name,
      status: r.status,
      checkins: sessions.length
        ? sessions.map((s) => ({
            sessionId: s.id,
            checkedIn: r.checkins.some((c) => c.session_id === s.id),
            checkedInAt: r.checkins.find((c) => c.session_id === s.id)?.checked_in_at ?? null,
          }))
        : [
            {
              sessionId: null,
              checkedIn: r.checkins.some((c) => c.session_id === null),
              checkedInAt: r.checkins.find((c) => c.session_id === null)?.checked_in_at ?? null,
            },
          ],
    }));

    return {
      eventId,
      sessions: sessions.map((s) => ({ id: s.id, title: s.title, sessionDate: s.session_date })),
      roster,
    };
  }

  async statistics(eventId: number) {
    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    const registrations = await this.prisma.club_event_registrations.findMany({
      where: { event_id: eventId, is_deleted: false, status: { not: 'cancelled' } },
      include: { checkins: true, tier: true },
    });

    const total = registrations.length;
    const attended = registrations.filter((r) => r.checkins.length > 0).length;
    const noShow = registrations.filter(
      (r) => r.status === 'confirmed' && r.checkins.length === 0,
    ).length;

    const byTier: Record<string, { total: number; attended: number }> = {};
    for (const r of registrations) {
      const tierName = r.tier?.name ?? 'بدون فئة';
      byTier[tierName] ??= { total: 0, attended: 0 };
      byTier[tierName].total += 1;
      if (r.checkins.length > 0) byTier[tierName].attended += 1;
    }

    return {
      eventId,
      total,
      attended,
      noShow,
      attendanceRate: total > 0 ? Math.round((attended / total) * 1000) / 10 : 0,
      byTier,
      totalRevenue: registrations.reduce((s, r) => s + toNum(r.paid_amount), 0),
    };
  }
}
