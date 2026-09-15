import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ListClubEventsDto } from './dto/list-club-events.dto';
import { UpsertClubEventDto } from './dto/upsert-club-event.dto';
import { ChangeEventStatusDto } from './dto/change-event-status.dto';
import { buildEventNumber, computeRegistrationOpen, localDateString, toNum } from './club-events.utils';

type EventStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'ongoing'
  | 'completed'
  | 'closed'
  | 'cancelled';

/**
 * Exact transition matrix (Part IV §a): draft→pending_approval→approved(or rejected)→published→
 * ongoing→completed→closed, plus cancel from any pre-completed state, plus rejected→draft (edit
 * returns it to draft for resubmission).
 */
const TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  approved: ['published', 'cancelled'],
  rejected: ['draft'],
  published: ['ongoing', 'cancelled'],
  ongoing: ['completed', 'cancelled'],
  completed: ['closed'],
  closed: [],
  cancelled: [],
};

/** Transitions that require the stricter `:approve` permission suffix instead of `:update`. */
const APPROVE_GATED = new Set<string>(['pending_approval->approved', 'pending_approval->rejected', 'completed->closed']);

@Injectable()
export class ClubEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BusinessAuditService,
  ) {}

  private mapEvent(
    row: Prisma.club_eventsGetPayload<{
      include: {
        category: true;
        tiers: true;
        sessions: true;
        staff: true;
      };
    }>,
  ) {
    const registrationOpen = computeRegistrationOpen({
      status: row.status,
      registration_opens: row.registration_opens,
      registration_closes: row.registration_closes,
      registration_paused: row.registration_paused,
      max_capacity: row.max_capacity,
      waitlist_capacity: row.waitlist_capacity,
      registrations_count: row.registrations_count,
    });

    return {
      id: row.id,
      eventNumber: row.event_number,
      title: row.title,
      description: row.description,
      coverImage: row.cover_image,
      categoryId: row.category_id,
      category: row.category
        ? { id: row.category.id, nameAr: row.category.name_ar, nameEn: row.category.name_en, kind: row.category.kind }
        : null,
      kind: row.kind,
      branchId: row.branch_id,
      hallId: row.hall_id,
      venueName: row.venue_name,
      startDate: row.start_date,
      endDate: row.end_date,
      startTime: row.start_time,
      endTime: row.end_time,
      registrationOpens: row.registration_opens,
      registrationCloses: row.registration_closes,
      registrationPaused: row.registration_paused,
      maxCapacity: row.max_capacity,
      waitlistCapacity: row.waitlist_capacity,
      visibility: row.visibility,
      status: row.status,
      isFree: row.is_free,
      allowGuests: row.allow_guests,
      requiresActiveSubscription: row.requires_active_subscription,
      minAge: row.min_age,
      maxAge: row.max_age,
      requiresGuardianConsent: row.requires_guardian_consent,
      campaignTag: row.campaign_tag,
      showInApp: row.show_in_app,
      registrationsCount: row.registrations_count,
      attendedCount: row.attended_count,
      closingNotes: row.closing_notes,
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      cancelReason: row.cancel_reason,
      registrationOpen,
      tiers: row.tiers?.map((t) => ({
        id: t.id,
        name: t.name,
        audience: t.audience,
        minAge: t.min_age,
        maxAge: t.max_age,
        price: toNum(t.price),
        earlyBirdPrice: t.early_bird_price != null ? toNum(t.early_bird_price) : null,
        earlyBirdUntil: t.early_bird_until,
        capacity: t.capacity,
        salesFrom: t.sales_from,
        salesUntil: t.sales_until,
        membersOnly: t.members_only,
        isActive: t.is_active,
      })),
      sessions: row.sessions?.map((s) => ({
        id: s.id,
        title: s.title,
        sessionDate: s.session_date,
        startTime: s.start_time,
        endTime: s.end_time,
        hallId: s.hall_id,
        trainerId: s.trainer_id,
        maxCapacity: s.max_capacity,
        orderIndex: s.order_index,
        status: s.status,
      })),
      staff: row.staff?.map((s) => ({
        id: s.id,
        sessionId: s.session_id,
        trainerId: s.trainer_id,
        employeeId: s.employee_id,
        externalName: s.external_name,
        externalPhone: s.external_phone,
        role: s.role,
        notes: s.notes,
      })),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private readonly detailInclude = {
    category: true,
    tiers: { orderBy: { id: 'asc' as const } },
    sessions: { orderBy: [{ session_date: 'asc' as const }, { order_index: 'asc' as const }] },
    staff: true,
  };

  async list(q: ListClubEventsDto) {
    const and: Prisma.club_eventsWhereInput[] = [{ is_deleted: false }];

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ title: { contains: s } }, { event_number: { contains: s } }],
      });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    if (q.kind) and.push({ kind: q.kind as never });
    if (q.categoryId) and.push({ category_id: Number(q.categoryId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status as never });
    if (q.from) and.push({ start_date: { gte: q.from } });
    if (q.to) and.push({ start_date: { lte: q.to } });

    const where: Prisma.club_eventsWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.club_events.findMany({
        where,
        include: this.detailInclude,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_events.count({ where }),
    ]);

    const data = rows.map((r) => this.mapEvent(r));
    return paginated(data, total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.club_events.findFirst({
      where: { id, is_deleted: false },
      include: this.detailInclude,
    });
    if (!row) throw new NotFoundException('الفعالية غير موجودة');
    return this.mapEvent(row);
  }

  private async findRawOrThrow(id: number) {
    const row = await this.prisma.club_events.findFirst({ where: { id, is_deleted: false } });
    if (!row) throw new NotFoundException('الفعالية غير موجودة');
    return row;
  }

  /**
   * EVT-YYYY-#### scoped per calendar year, generated inside a transaction with a MySQL advisory
   * lock + retry-on-collision (mirrors club_subscriptions' generateSubNumber / ledger.service.ts's
   * entry_no retry) — NOT a race-prone plain count()+1 probe.
   */
  private async generateEventNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT GET_LOCK('club_event_number', 10)`;
      try {
        const prefix = `EVT-${year}-`;
        const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
          SELECT MAX(CAST(SUBSTRING(event_number, ${prefix.length + 1}) AS UNSIGNED)) AS maxNum
          FROM club_events WHERE event_number LIKE ${`${prefix}%`}
        `;
        const next = Number(rows[0]?.maxNum ?? 0) + 1;
        return buildEventNumber(year, next);
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK('club_event_number')`;
      }
    });
  }

  async create(dto: UpsertClubEventDto, userId?: number) {
    if (!dto.title || !dto.categoryId || !dto.kind || !dto.branchId || !dto.startDate || !dto.endDate) {
      throw new BadRequestException('الحقول المطلوبة: العنوان، التصنيف، النوع، الفرع، تاريخ البداية والنهاية');
    }

    const category = await this.prisma.club_event_categories.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('التصنيف غير موجود');

    const eventNumber = await this.generateEventNumber();

    const row = await this.prisma.club_events.create({
      data: {
        event_number: eventNumber,
        title: dto.title,
        description: dto.description ?? null,
        cover_image: dto.coverImage ?? null,
        category_id: dto.categoryId,
        kind: dto.kind as never,
        branch_id: dto.branchId,
        hall_id: dto.hallId ?? null,
        venue_name: dto.venueName ?? null,
        start_date: dto.startDate,
        end_date: dto.endDate,
        start_time: dto.startTime ?? null,
        end_time: dto.endTime ?? null,
        registration_opens: dto.registrationOpens ?? null,
        registration_closes: dto.registrationCloses ?? null,
        registration_paused: dto.registrationPaused ?? false,
        max_capacity: dto.maxCapacity ?? 0,
        waitlist_capacity: dto.waitlistCapacity ?? 0,
        visibility: (dto.visibility as never) ?? 'members',
        status: 'draft',
        is_free: dto.isFree ?? false,
        allow_guests: dto.allowGuests ?? false,
        requires_active_subscription: dto.requiresActiveSubscription ?? true,
        min_age: dto.minAge ?? null,
        max_age: dto.maxAge ?? null,
        requires_guardian_consent: dto.requiresGuardianConsent ?? false,
        campaign_tag: dto.campaignTag ?? null,
        show_in_app: dto.showInApp ?? false,
        created_by: userId ?? null,
      },
      include: this.detailInclude,
    });

    await this.audit.log({
      entityType: 'club_event',
      entityId: row.id,
      action: 'create',
      actorUserId: userId,
      branchId: row.branch_id,
      after: { eventNumber, title: row.title, kind: row.kind, status: row.status },
    });

    return this.mapEvent(row);
  }

  async update(id: number, dto: Partial<UpsertClubEventDto>, userId?: number) {
    const existing = await this.findRawOrThrow(id);

    if (existing.status === 'completed' || existing.status === 'closed' || existing.status === 'cancelled') {
      throw new BadRequestException('لا يمكن تعديل فعالية مكتملة أو مغلقة أو ملغاة');
    }

    if (dto.categoryId != null) {
      const category = await this.prisma.club_event_categories.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new BadRequestException('التصنيف غير موجود');
    }

    const row = await this.prisma.club_events.update({
      where: { id },
      data: {
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.coverImage !== undefined ? { cover_image: dto.coverImage } : {}),
        ...(dto.categoryId != null ? { category_id: dto.categoryId } : {}),
        ...(dto.kind != null ? { kind: dto.kind as never } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.hallId !== undefined ? { hall_id: dto.hallId } : {}),
        ...(dto.venueName !== undefined ? { venue_name: dto.venueName } : {}),
        ...(dto.startDate != null ? { start_date: dto.startDate } : {}),
        ...(dto.endDate != null ? { end_date: dto.endDate } : {}),
        ...(dto.startTime !== undefined ? { start_time: dto.startTime } : {}),
        ...(dto.endTime !== undefined ? { end_time: dto.endTime } : {}),
        ...(dto.registrationOpens !== undefined ? { registration_opens: dto.registrationOpens } : {}),
        ...(dto.registrationCloses !== undefined ? { registration_closes: dto.registrationCloses } : {}),
        ...(dto.registrationPaused !== undefined ? { registration_paused: dto.registrationPaused } : {}),
        ...(dto.maxCapacity != null ? { max_capacity: dto.maxCapacity } : {}),
        ...(dto.waitlistCapacity != null ? { waitlist_capacity: dto.waitlistCapacity } : {}),
        ...(dto.visibility != null ? { visibility: dto.visibility as never } : {}),
        ...(dto.isFree !== undefined ? { is_free: dto.isFree } : {}),
        ...(dto.allowGuests !== undefined ? { allow_guests: dto.allowGuests } : {}),
        ...(dto.requiresActiveSubscription !== undefined
          ? { requires_active_subscription: dto.requiresActiveSubscription }
          : {}),
        ...(dto.minAge !== undefined ? { min_age: dto.minAge } : {}),
        ...(dto.maxAge !== undefined ? { max_age: dto.maxAge } : {}),
        ...(dto.requiresGuardianConsent !== undefined
          ? { requires_guardian_consent: dto.requiresGuardianConsent }
          : {}),
        ...(dto.campaignTag !== undefined ? { campaign_tag: dto.campaignTag } : {}),
        ...(dto.showInApp !== undefined ? { show_in_app: dto.showInApp } : {}),
      },
      include: this.detailInclude,
    });

    await this.audit.log({
      entityType: 'club_event',
      entityId: id,
      action: 'update',
      actorUserId: userId,
      branchId: existing.branch_id,
      before: { title: existing.title, status: existing.status },
      after: { title: row.title, status: row.status },
    });

    return this.mapEvent(row);
  }

  /**
   * Enforced transition matrix (Part IV §a / comm-events discipline). `canApprove` reflects
   * whether the caller holds the `:approve` permission suffix — required for pending_approval→
   * approved/rejected and completed→closed; other transitions only need `:update` (checked by the
   * controller's base `@RequiresPermission`, so this just guards the approve-gated subset).
   */
  async changeStatus(id: number, dto: ChangeEventStatusDto, userId: number | undefined, canApprove: boolean) {
    const existing = await this.findRawOrThrow(id);
    const from = existing.status as EventStatus;
    const to = dto.status as EventStatus;

    const allowed = TRANSITIONS[from] ?? [];
    // Cancel is allowed from any pre-completed state, layered on top of the base matrix.
    const isCancel = to === 'cancelled';
    const preCompleted: EventStatus[] = ['draft', 'pending_approval', 'approved', 'published', 'ongoing'];
    const cancelAllowed = isCancel && preCompleted.includes(from);

    if (!allowed.includes(to) && !cancelAllowed) {
      throw new BadRequestException(`لا يمكن الانتقال من الحالة "${from}" إلى "${to}"`);
    }

    const transitionKey = `${from}->${to}`;
    if ((APPROVE_GATED.has(transitionKey) || isCancel) && !canApprove) {
      throw new ForbiddenException('هذا الإجراء يتطلب صلاحية الاعتماد');
    }

    if (to === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('سبب الرفض مطلوب');
    }
    if (isCancel && !dto.reason?.trim()) {
      throw new BadRequestException('سبب الإلغاء مطلوب');
    }

    const data: Prisma.club_eventsUpdateInput = { status: to };
    if (to === 'approved') {
      data.approved_by = userId ?? null;
      data.approved_at = new Date();
    }
    if (to === 'rejected') {
      data.cancel_reason = dto.reason ?? null;
    }
    if (isCancel) {
      data.cancel_reason = dto.reason ?? null;
    }
    if (to === 'closed') {
      data.closed_by = userId ?? null;
      data.closed_at = new Date();
      if (dto.reason) data.closing_notes = dto.reason;
    }

    const row = await this.prisma.club_events.update({
      where: { id },
      data,
      include: this.detailInclude,
    });

    await this.audit.log({
      entityType: 'club_event',
      entityId: id,
      action: 'status_change',
      actorUserId: userId,
      branchId: existing.branch_id,
      before: { status: from },
      after: { status: to, reason: dto.reason },
      reason: dto.reason,
    });

    return this.mapEvent(row);
  }

  async duplicate(id: number, userId?: number) {
    const existing = await this.prisma.club_events.findFirst({
      where: { id, is_deleted: false },
      include: { tiers: true, sessions: true },
    });
    if (!existing) throw new NotFoundException('الفعالية غير موجودة');

    const eventNumber = await this.generateEventNumber();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_events.create({
        data: {
          event_number: eventNumber,
          title: `${existing.title} (نسخة)`,
          description: existing.description,
          cover_image: existing.cover_image,
          category_id: existing.category_id,
          kind: existing.kind,
          branch_id: existing.branch_id,
          hall_id: existing.hall_id,
          venue_name: existing.venue_name,
          start_date: existing.start_date,
          end_date: existing.end_date,
          start_time: existing.start_time,
          end_time: existing.end_time,
          registration_opens: existing.registration_opens,
          registration_closes: existing.registration_closes,
          registration_paused: false,
          max_capacity: existing.max_capacity,
          waitlist_capacity: existing.waitlist_capacity,
          visibility: existing.visibility,
          status: 'draft',
          is_free: existing.is_free,
          allow_guests: existing.allow_guests,
          requires_active_subscription: existing.requires_active_subscription,
          min_age: existing.min_age,
          max_age: existing.max_age,
          requires_guardian_consent: existing.requires_guardian_consent,
          campaign_tag: existing.campaign_tag,
          show_in_app: false,
          created_by: userId ?? null,
        },
      });

      if (existing.tiers.length) {
        await tx.club_event_ticket_tiers.createMany({
          data: existing.tiers.map((t) => ({
            event_id: created.id,
            name: t.name,
            audience: t.audience,
            min_age: t.min_age,
            max_age: t.max_age,
            price: t.price,
            early_bird_price: t.early_bird_price,
            early_bird_until: t.early_bird_until,
            capacity: t.capacity,
            sales_from: t.sales_from,
            sales_until: t.sales_until,
            members_only: t.members_only,
            is_active: t.is_active,
          })),
        });
      }

      if (existing.sessions.length) {
        await tx.club_event_sessions.createMany({
          data: existing.sessions.map((s) => ({
            event_id: created.id,
            title: s.title,
            session_date: s.session_date,
            start_time: s.start_time,
            end_time: s.end_time,
            hall_id: s.hall_id,
            trainer_id: s.trainer_id,
            max_capacity: s.max_capacity,
            order_index: s.order_index,
            status: 'scheduled',
            notes: s.notes,
          })),
        });
      }

      return created;
    });

    await this.audit.log({
      entityType: 'club_event',
      entityId: row.id,
      action: 'duplicate',
      actorUserId: userId,
      branchId: row.branch_id,
      after: { eventNumber, sourceEventId: id },
    });

    return this.findOne(row.id);
  }

  async remove(id: number, userId?: number) {
    const existing = await this.findRawOrThrow(id);
    if (existing.status !== 'draft' && existing.status !== 'cancelled') {
      throw new BadRequestException('لا يمكن حذف الفعالية إلا في حالة المسودة أو الملغاة');
    }

    await this.prisma.club_events.update({ where: { id }, data: { is_deleted: true } });

    await this.audit.log({
      entityType: 'club_event',
      entityId: id,
      action: 'delete',
      actorUserId: userId,
      branchId: existing.branch_id,
      before: { title: existing.title, status: existing.status },
    });

    return { success: true };
  }

  async statistics() {
    const rows = await this.prisma.club_events.findMany({ where: { is_deleted: false } });
    const byStatus: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    let upcoming = 0;
    const today = localDateString();
    const monthStart = today.slice(0, 7);

    let revenueMtd = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
      if (r.start_date >= today && (r.status === 'published' || r.status === 'approved')) upcoming++;
    }

    const payments = await this.prisma.club_event_payments.findMany({
      where: {
        status: 'completed',
        payment_date: { gte: `${monthStart}-01` },
        type: 'payment',
      },
      select: { amount: true },
    });
    revenueMtd = payments.reduce((s, p) => s + toNum(p.amount), 0);

    return {
      total: rows.length,
      byStatus,
      byKind,
      upcoming,
      revenueMtd,
    };
  }
}
