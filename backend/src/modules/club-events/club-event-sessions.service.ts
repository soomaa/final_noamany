import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubCalendarService } from '../gym-ops/club-calendar.service';
import { ListClubEventSessionsDto } from './dto/list-club-event-sessions.dto';

type SessionRow = {
  id: number;
  event_id: number;
  title: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  hall_id: number | null;
  trainer_id: number | null;
  max_capacity: number | null;
  order_index: number;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ClubEventSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: ClubCalendarService,
    private readonly audit: BusinessAuditService,
  ) {}

  private mapSession(row: SessionRow) {
    return {
      id: row.id,
      eventId: row.event_id,
      title: row.title,
      sessionDate: row.session_date,
      startTime: row.start_time,
      endTime: row.end_time,
      hallId: row.hall_id,
      trainerId: row.trainer_id,
      maxCapacity: row.max_capacity,
      orderIndex: row.order_index,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async getEventOrThrow(eventId: number) {
    const event = await this.prisma.club_events.findFirst({
      where: { id: eventId, is_deleted: false },
    });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    return event;
  }

  async list(eventId: number, q: ListClubEventSessionsDto) {
    await this.getEventOrThrow(eventId);

    const and: Prisma.club_event_sessionsWhereInput[] = [{ event_id: eventId }];
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessClassStatusFilter['equals'] });
    }

    const where: Prisma.club_event_sessionsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_event_sessions.findMany({
        where,
        orderBy: [{ session_date: 'asc' }, { order_index: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_event_sessions.count({ where }),
    ]);

    return paginated(rows.map((r) => this.mapSession(r)), total, q.page, q.pageSize);
  }

  async findOne(eventId: number, id: number) {
    const row = await this.prisma.club_event_sessions.findFirst({
      where: { id, event_id: eventId },
    });
    if (!row) throw new NotFoundException('جلسة الفعالية غير موجودة');
    return this.mapSession(row);
  }

  async create(eventId: number, body: Record<string, unknown>, userId?: number) {
    const event = await this.getEventOrThrow(eventId);

    if (!body.sessionDate || !body.startTime || !body.endTime) {
      throw new BadRequestException('يرجى إدخال تاريخ الجلسة ووقت البداية والنهاية');
    }

    const sessionDate = String(body.sessionDate);
    const startTime = String(body.startTime);
    const endTime = String(body.endTime);
    const hallId = body.hallId != null ? Number(body.hallId) : null;
    const trainerId = body.trainerId != null ? Number(body.trainerId) : null;

    if (hallId) {
      const hall = await this.prisma.club_halls.findFirst({
        where: { id: hallId, is_deleted: false },
      });
      if (!hall) throw new NotFoundException('القاعة غير موجودة');

      const { hasConflict, conflicts } = await this.calendar.detectConflicts({
        classDate: sessionDate,
        startTime,
        endTime,
        trainerId: trainerId ?? undefined,
        hallId,
        branchId: event.branch_id,
      });

      if (hasConflict) {
        throw new ConflictException({
          message: 'تعارض في الجدول — القاعة أو المدرب محجوزان في هذا الوقت',
          conflicts,
        });
      }
    }

    let orderIndex = body.orderIndex != null ? Number(body.orderIndex) : undefined;
    if (orderIndex == null) {
      const last = await this.prisma.club_event_sessions.findFirst({
        where: { event_id: eventId },
        orderBy: { order_index: 'desc' },
      });
      orderIndex = (last?.order_index ?? -1) + 1;
    }

    try {
      const row = await this.prisma.club_event_sessions.create({
        data: {
          event_id: eventId,
          title: body.title ? String(body.title) : null,
          session_date: sessionDate,
          start_time: startTime,
          end_time: endTime,
          hall_id: hallId,
          trainer_id: trainerId,
          max_capacity: body.maxCapacity != null ? Number(body.maxCapacity) : null,
          order_index: orderIndex,
          status: 'scheduled',
          notes: body.notes ? String(body.notes) : null,
        },
      });

      await this.audit.log({
        entityType: 'club_event_session',
        entityId: row.id,
        action: 'create',
        actorUserId: userId,
        branchId: event.branch_id,
        after: this.mapSession(row),
      });

      return this.mapSession(row);
    } catch (e) {
      await this.audit.log({
        entityType: 'club_event_session',
        entityId: `event-${eventId}`,
        action: 'create.failed',
        actorUserId: userId,
        branchId: event.branch_id,
        reason: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async update(eventId: number, id: number, body: Record<string, unknown>, userId?: number) {
    const event = await this.getEventOrThrow(eventId);
    const existing = await this.findOne(eventId, id);

    const sessionDate = body.sessionDate != null ? String(body.sessionDate) : existing.sessionDate;
    const startTime = body.startTime != null ? String(body.startTime) : existing.startTime;
    const endTime = body.endTime != null ? String(body.endTime) : existing.endTime;
    const hallId = body.hallId !== undefined ? (body.hallId ? Number(body.hallId) : null) : existing.hallId;
    const trainerId =
      body.trainerId !== undefined ? (body.trainerId ? Number(body.trainerId) : null) : existing.trainerId;

    const scheduleChanged =
      body.sessionDate != null ||
      body.startTime != null ||
      body.endTime != null ||
      body.hallId !== undefined ||
      body.trainerId !== undefined;

    if (hallId && scheduleChanged) {
      const hall = await this.prisma.club_halls.findFirst({
        where: { id: hallId, is_deleted: false },
      });
      if (!hall) throw new NotFoundException('القاعة غير موجودة');

      const { hasConflict, conflicts } = await this.calendar.detectConflicts({
        classDate: sessionDate,
        startTime,
        endTime,
        trainerId: trainerId ?? undefined,
        hallId,
        branchId: event.branch_id,
        excludeClassId: id,
      });

      if (hasConflict) {
        throw new ConflictException({
          message: 'تعارض في الجدول — القاعة أو المدرب محجوزان في هذا الوقت',
          conflicts,
        });
      }
    }

    try {
      const row = await this.prisma.club_event_sessions.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title ? String(body.title) : null } : {}),
          ...(body.sessionDate != null ? { session_date: sessionDate } : {}),
          ...(body.startTime != null ? { start_time: startTime } : {}),
          ...(body.endTime != null ? { end_time: endTime } : {}),
          ...(body.hallId !== undefined ? { hall_id: hallId } : {}),
          ...(body.trainerId !== undefined ? { trainer_id: trainerId } : {}),
          ...(body.maxCapacity !== undefined
            ? { max_capacity: body.maxCapacity != null ? Number(body.maxCapacity) : null }
            : {}),
          ...(body.orderIndex != null ? { order_index: Number(body.orderIndex) } : {}),
          ...(body.status != null
            ? { status: String(body.status) as Prisma.EnumClubFitnessClassStatusFieldUpdateOperationsInput['set'] }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        },
      });

      await this.audit.log({
        entityType: 'club_event_session',
        entityId: id,
        action: 'update',
        actorUserId: userId,
        branchId: event.branch_id,
        before: existing,
        after: this.mapSession(row),
      });

      return this.mapSession(row);
    } catch (e) {
      await this.audit.log({
        entityType: 'club_event_session',
        entityId: id,
        action: 'update.failed',
        actorUserId: userId,
        branchId: event.branch_id,
        reason: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async remove(eventId: number, id: number, userId?: number) {
    const event = await this.getEventOrThrow(eventId);
    const existing = await this.findOne(eventId, id);

    const checkinCount = await this.prisma.club_event_checkins.count({
      where: { session_id: id },
    });
    if (checkinCount > 0) {
      throw new BadRequestException('لا يمكن حذف جلسة يوجد بها تسجيلات حضور');
    }

    try {
      await this.prisma.club_event_sessions.delete({ where: { id } });

      await this.audit.log({
        entityType: 'club_event_session',
        entityId: id,
        action: 'delete',
        actorUserId: userId,
        branchId: event.branch_id,
        before: existing,
      });

      return { success: true };
    } catch (e) {
      await this.audit.log({
        entityType: 'club_event_session',
        entityId: id,
        action: 'delete.failed',
        actorUserId: userId,
        branchId: event.branch_id,
        reason: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }
}
