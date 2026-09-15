import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubEventCheckinService } from './club-event-checkin.service';
import { ClubEventRegistrationsService } from './club-event-registrations.service';
import { attachMemberBrief, loadMemberBriefMap } from '../club-members/club-member-brief.utils';
import {
  CreateProgramSegmentDto,
  GuestByPhoneQuery,
  GuestLiveCheckinDto,
  ProgramSegmentListQuery,
  UpdateEventDisplaySettingsDto,
  UpdateProgramSegmentDto,
} from './dto/club-event-live.dto';

const SETTINGS_MAX_JSON_BYTES = 64 * 1024;

@Injectable()
export class ClubEventDisplaySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
  ) {}

  private async assertEvent(eventId: number) {
    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    return event;
  }

  async get(eventId: number): Promise<Record<string, unknown>> {
    await this.assertEvent(eventId);
    const row = await this.prisma.club_event_display_settings.upsert({
      where: { event_id: eventId },
      create: { event_id: eventId, data: {} },
      update: {},
    });
    const data = (row.data ?? {}) as Record<string, unknown>;
    return { ...data, id: row.id, eventId };
  }

  async update(eventId: number, dto: UpdateEventDisplaySettingsDto, userId?: number) {
    await this.assertEvent(eventId);
    const { id: _ignored, eventId: _e, ...payload } = dto as Record<string, unknown>;
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('لا توجد إعدادات للحفظ');
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > SETTINGS_MAX_JSON_BYTES) {
      throw new BadRequestException('حجم الإعدادات يتجاوز الحد المسموح (64KB)');
    }

    const { row, previous } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.club_event_display_settings.findUnique({ where: { event_id: eventId } });
      const previous = (existing?.data ?? {}) as Record<string, unknown>;
      const merged = { ...previous, ...payload } as Prisma.InputJsonValue;
      const row = existing
        ? await tx.club_event_display_settings.update({
            where: { event_id: eventId },
            data: { data: merged },
          })
        : await tx.club_event_display_settings.create({
            data: { event_id: eventId, data: merged },
          });
      return { row, previous };
    });

    await this.audit.log({
      entityType: 'club_event_display_settings',
      entityId: row.id,
      action: 'upsert',
      actorUserId: userId,
      after: payload,
      before: previous,
    });

    const stored = (row.data ?? {}) as Record<string, unknown>;
    return { ...stored, id: row.id, eventId };
  }
}

@Injectable()
export class ClubEventProgramSegmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
  ) {}

  private async assertEvent(eventId: number) {
    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    return event;
  }

  private mapSegment(row: {
    id: number;
    event_id: number;
    title: string;
    description: string | null;
    kind: string;
    media_urls: Prisma.JsonValue;
    video_url: string | null;
    duration_seconds: number;
    order_index: number;
    enabled: boolean;
    scheduled_time: string | null;
    duration_minutes: number | null;
    show_duration: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    const media = row.media_urls;
    return {
      id: row.id,
      eventId: row.event_id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      mediaUrls: Array.isArray(media) ? media : [],
      videoUrl: row.video_url,
      durationSeconds: row.duration_seconds,
      orderIndex: row.order_index,
      enabled: row.enabled,
      scheduledTime: row.scheduled_time,
      durationMinutes: row.duration_minutes,
      showDuration: row.show_duration,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(eventId: number, q: ProgramSegmentListQuery) {
    await this.assertEvent(eventId);
    const onlyEnabled = q.onlyEnabled === 'true';
    const rows = await this.prisma.club_event_program_segments.findMany({
      where: {
        event_id: eventId,
        deleted_at: null,
        ...(onlyEnabled ? { enabled: true } : {}),
      },
      orderBy: { order_index: 'asc' },
    });
    return { data: rows.map((r) => this.mapSegment(r)), total: rows.length };
  }

  async get(eventId: number, id: number) {
    const row = await this.prisma.club_event_program_segments.findFirst({
      where: { id, event_id: eventId, deleted_at: null },
    });
    if (!row) throw new NotFoundException('فقرة البرنامج غير موجودة');
    return this.mapSegment(row);
  }

  async create(eventId: number, dto: CreateProgramSegmentDto, userId?: number) {
    await this.assertEvent(eventId);
    const maxOrder = await this.prisma.club_event_program_segments.aggregate({
      where: { event_id: eventId, deleted_at: null },
      _max: { order_index: true },
    });
    const row = await this.prisma.club_event_program_segments.create({
      data: {
        event_id: eventId,
        title: dto.title,
        description: dto.description ?? null,
        kind: dto.kind ?? 'text',
        media_urls: dto.mediaUrls ?? [],
        video_url: dto.videoUrl ?? null,
        duration_seconds: dto.durationSeconds ?? 0,
        order_index: dto.orderIndex ?? (maxOrder._max.order_index ?? -1) + 1,
        enabled: dto.enabled ?? true,
        scheduled_time: dto.scheduledTime ?? null,
        duration_minutes: dto.durationMinutes ?? null,
        show_duration: dto.showDuration ?? true,
      },
    });
    await this.audit.log({
      entityType: 'club_event_program_segment',
      entityId: row.id,
      action: 'create',
      actorUserId: userId,
      after: dto,
    });
    return this.mapSegment(row);
  }

  async update(eventId: number, id: number, dto: UpdateProgramSegmentDto, userId?: number) {
    await this.get(eventId, id);
    const data: Prisma.club_event_program_segmentsUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description ?? null;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.mediaUrls !== undefined) data.media_urls = dto.mediaUrls;
    if (dto.videoUrl !== undefined) data.video_url = dto.videoUrl ?? null;
    if (dto.durationSeconds !== undefined) data.duration_seconds = dto.durationSeconds;
    if (dto.orderIndex !== undefined) data.order_index = dto.orderIndex;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.scheduledTime !== undefined) data.scheduled_time = dto.scheduledTime ?? null;
    if (dto.durationMinutes !== undefined) data.duration_minutes = dto.durationMinutes ?? null;
    if (dto.showDuration !== undefined) data.show_duration = dto.showDuration;
    const row = await this.prisma.club_event_program_segments.update({ where: { id }, data });
    await this.audit.log({
      entityType: 'club_event_program_segment',
      entityId: id,
      action: 'update',
      actorUserId: userId,
      after: dto,
    });
    return this.mapSegment(row);
  }

  async remove(eventId: number, id: number, userId?: number) {
    await this.get(eventId, id);
    await this.prisma.club_event_program_segments.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    await this.audit.log({
      entityType: 'club_event_program_segment',
      entityId: id,
      action: 'delete',
      actorUserId: userId,
    });
    return { id, deleted: true };
  }
}

@Injectable()
export class ClubEventLiveCheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrations: ClubEventRegistrationsService,
    private readonly checkin: ClubEventCheckinService,
  ) {}

  private parseHonorific(notes: string | null): string | null {
    if (!notes) return null;
    const m = notes.match(/^TITLE:(.+)$/m);
    return m?.[1]?.trim() ?? null;
  }

  private mapLiveAttendee(
    registration: {
      id: number;
      registrant_type: string;
      guest_name: string | null;
      guest_phone: string | null;
      notes: string | null;
      member_id: number | null;
    },
    checkin: { id: number; method: string; checked_in_at: Date },
    memberMap: Map<number, import('../club-members/club-member-brief.utils').MemberBrief>,
  ) {
    const brief = attachMemberBrief(registration.member_id, memberMap);
    const name =
      registration.registrant_type === 'guest'
        ? registration.guest_name ?? ''
        : brief.memberName ?? '';
    return {
      id: String(checkin.id),
      registrationId: registration.id,
      name,
      phone: registration.guest_phone ?? brief.memberPhone ?? null,
      title: registration.registrant_type === 'guest' ? this.parseHonorific(registration.notes) : null,
      checkedInAt: checkin.checked_in_at,
      source: checkin.method === 'qr' ? 'qr' : checkin.method === 'manual' ? 'direct' : 'direct',
      registrantType: registration.registrant_type,
    };
  }

  async getByPhone(eventId: number, q: GuestByPhoneQuery) {
    const phone = q.phone.replace(/\s/g, '');
    const registration = await this.prisma.club_event_registrations.findFirst({
      where: {
        event_id: eventId,
        guest_phone: phone,
        is_deleted: false,
        status: { not: 'cancelled' },
      },
      include: { checkins: { orderBy: { checked_in_at: 'desc' }, take: 1 } },
    });
    if (!registration) return null;
    const checkin = registration.checkins[0];
    return {
      id: registration.id,
      name: registration.guest_name,
      phone: registration.guest_phone,
      title: this.parseHonorific(registration.notes),
      checkedInAt: checkin?.checked_in_at ?? registration.created_at,
      createdAt: registration.created_at,
    };
  }

  async guestCheckin(eventId: number, dto: GuestLiveCheckinDto, userId?: number) {
    const phone = dto.phone.replace(/\s/g, '');
    const existing = await this.getByPhone(eventId, { phone });
    if (existing) {
      throw new ConflictException({
        message: 'تم التسجيل مسبقاً',
        existing,
      });
    }

    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    if (!['approved', 'published', 'ongoing'].includes(event.status)) {
      throw new BadRequestException('تسجيل الحضور غير متاح لهذه الفعالية في حالتها الحالية');
    }

    const notes = dto.title?.trim() ? `TITLE:${dto.title.trim()}` : undefined;
    const registration = await this.registrations.register(
      {
        eventId,
        registrantType: 'guest',
        guestName: dto.name.trim(),
        guestPhone: phone,
        branchId: event.branch_id,
        channel: dto.source === 'qr' ? 'qr' : 'kiosk',
        notes,
      },
      userId,
      { liveSelfCheckin: true },
    );

    const checkin = await this.checkin.liveGuest(
      registration.id,
      eventId,
      dto.source === 'qr' ? 'qr' : 'manual',
      userId,
    );

    return {
      registration,
      checkin,
      name: dto.name.trim(),
      title: dto.title?.trim() ?? null,
    };
  }

  async recentCheckins(eventId: number, limit = 50) {
    const event = await this.prisma.club_events.findFirst({ where: { id: eventId, is_deleted: false } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    const checkins = await this.prisma.club_event_checkins.findMany({
      where: { event_id: eventId },
      orderBy: { checked_in_at: 'desc' },
      take: limit,
      include: {
        registration: {
          select: {
            id: true,
            registrant_type: true,
            guest_name: true,
            guest_phone: true,
            notes: true,
            member_id: true,
          },
        },
      },
    });

    const memberMap = await loadMemberBriefMap(
      this.prisma,
      checkins.map((c) => c.registration.member_id),
    );

    return {
      eventId,
      total: checkins.length,
      data: checkins.map((c) => this.mapLiveAttendee(c.registration, c, memberMap)),
    };
  }
}
