import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClubClassAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertNotPastDate } from '../../common/validators';
import { paginated } from '../../common/dto/list-result';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { ClubCalendarService } from '../gym-ops/club-calendar.service';
import { WebhookService } from '../webhooks/webhook.service';
import { assertEndTimeAfterStart, isActiveEnrollment, localDateString, toNum } from './club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap } from '../club-members/club-member-brief.utils';
import { ListClubClassesDto } from './dto/list-club-classes.dto';

@Injectable()
export class ClubClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
    private readonly calendar: ClubCalendarService,
    private readonly webhooks: WebhookService,
  ) {}

  private async countActiveEnrollments(classId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.club_class_enrollments.count({
      where: { class_id: classId, attendance_status: { not: 'cancelled' } },
    });
  }

  private mapClass(row: any, enrollmentCount?: number) {
    const activeEnrollments =
      row.enrollments?.filter((e) => isActiveEnrollment(e.attendance_status)) ?? [];
    return {
      id: row.id,
      classTypeId: row.class_type_id,
      templateSlotId: row.template_slot_id,
      className: row.class_name,
      description: row.description,
      trainerId: row.trainer_id,
      branchId: row.branch_id,
      hallId: row.hall_id,
      classDate: row.class_date,
      startTime: row.start_time,
      endTime: row.end_time,
      maxCapacity: row.max_capacity,
      price: toNum(row.price),
      status: row.status,
      audience: row.audience,
      cancelledReason: row.cancelled_reason,
      rescheduledAt: row.rescheduled_at,
      notes: row.notes,
      isActive: row.is_active,
      enrollmentCount: enrollmentCount ?? activeEnrollments.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      trainer: row.trainer,
      classType: row.class_type
        ? { id: row.class_type.id, name: row.class_type.name, color: row.class_type.color }
        : null,
      hall: row.hall,
      enrollments: row.enrollments?.map((e) => ({
        id: e.id,
        memberId: e.member_id,
        enrollmentDate: e.enrollment_date,
        attendanceStatus: e.attendance_status,
        attendanceTime: e.attendance_time,
        bookingSource: e.booking_source,
        subscriptionId: e.subscription_id,
        notes: e.notes,
      })),
    };
  }

  private classAudience(value: unknown): ClubClassAudience {
    const audience = String(value ?? 'mixed') as ClubClassAudience;
    if (!Object.values(ClubClassAudience).includes(audience)) {
      throw new BadRequestException('نوع الحضور يجب أن يكون men أو women أو kids أو mixed');
    }
    return audience;
  }

  private async enrichClass<T extends { enrollments?: Array<{ memberId: number }> }>(cls: T): Promise<T> {
    if (!cls.enrollments?.length) return cls;
    const memberMap = await loadMemberBriefMap(this.prisma, cls.enrollments.map((e) => e.memberId));
    return {
      ...cls,
      enrollments: cls.enrollments.map((e) => ({ ...e, ...attachMemberBrief(e.memberId, memberMap) })),
    };
  }

  async list(q: ListClubClassesDto) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ class_name: { contains: s } }, { description: { contains: s } }] });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    if (q.trainer && q.trainer !== 'all') and.push({ trainer_id: Number(q.trainer) });
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessClassStatusFilter['equals'] });
    }
    if (q.dateFrom && q.dateTo) {
      and.push({ class_date: { gte: q.dateFrom, lte: q.dateTo } });
    } else if (q.dateFrom) {
      and.push({ class_date: { gte: q.dateFrom } });
    } else if (q.dateTo) {
      and.push({ class_date: { lte: q.dateTo } });
    }
    if (q.personalOnly) and.push({ max_capacity: 1 });

    const where: Prisma.club_classesWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_classes.findMany({
        where,
        include: {
          trainer: { select: { id: true, name: true, phone: true, email: true } },
          hall: { select: { id: true, name: true, hall_number: true } },
          class_type: { select: { id: true, name: true, color: true } },
          enrollments: { where: { attendance_status: { not: 'cancelled' } } },
        },
        orderBy: [
          { class_date: q.dateOrder === 'asc' ? 'asc' : 'desc' },
          { start_time: 'asc' },
        ],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_classes.count({ where }),
    ]);

    return paginated(
      await Promise.all(rows.map(async (r) => this.enrichClass(this.mapClass(r)))),
      total,
      q.page,
      q.pageSize,
    );
  }

  async statistics(query?: { branch?: string; trainer?: string; dateFrom?: string; dateTo?: string }) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (query?.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    if (query?.trainer && query.trainer !== 'all') and.push({ trainer_id: Number(query.trainer) });
    if (query?.dateFrom && query?.dateTo) {
      and.push({ class_date: { gte: query.dateFrom, lte: query.dateTo } });
    }
    const where: Prisma.club_classesWhereInput = { AND: and };

    const [total, scheduled, completed, cancelled] = await Promise.all([
      this.prisma.club_classes.count({ where }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'scheduled' }] } }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'completed' }] } }),
      this.prisma.club_classes.count({ where: { AND: [...and, { status: 'cancelled' }] } }),
    ]);

    const classIds = await this.prisma.club_classes.findMany({ where, select: { id: true } });
    const ids = classIds.map((c) => c.id);

    const [totalEnrollments, totalAttendances] = ids.length
      ? await Promise.all([
          this.prisma.club_class_enrollments.count({
            where: { class_id: { in: ids }, attendance_status: { not: 'cancelled' } },
          }),
          this.prisma.club_class_enrollments.count({
            where: { class_id: { in: ids }, attendance_status: 'attended' },
          }),
        ])
      : [0, 0];

    return {
      totalClasses: total,
      scheduledClasses: scheduled,
      completedClasses: completed,
      cancelledClasses: cancelled,
      totalEnrollments,
      totalAttendances,
      attendanceRate: totalEnrollments > 0 ? (totalAttendances / totalEnrollments) * 100 : 0,
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.club_classes.findFirst({
      where: { id, is_deleted: false },
      include: {
        trainer: { select: { id: true, name: true, phone: true, email: true } },
        hall: { select: { id: true, name: true, hall_number: true } },
        class_type: { select: { id: true, name: true, color: true } },
        enrollments: true,
      },
    });
    if (!row) throw new NotFoundException('الحصة غير موجودة');
    return this.enrichClass(this.mapClass(row));
  }

  private async assertSchedule(
    body: {
      trainerId: number;
      branchId: number;
      classDate: string;
      startTime: string;
      endTime: string;
      hallId?: number | null;
    },
    excludeClassId?: number,
  ) {
    assertEndTimeAfterStart(body.startTime, body.endTime);
    assertNotPastDate(body.classDate);
    const { hasConflict, conflicts } = await this.calendar.detectConflicts({
      classDate: body.classDate,
      startTime: body.startTime,
      endTime: body.endTime,
      trainerId: body.trainerId,
      hallId: body.hallId ?? undefined,
      branchId: body.branchId,
      excludeClassId,
    });
    if (hasConflict) {
      throw new ConflictException({
        message: 'تعارض في الجدول — المدرب أو القاعة محجوزان في هذا الوقت',
        conflicts,
      });
    }
  }

  async advanceStatuses(): Promise<{ ongoing: number; completed: number }> {
    const today = localDateString();
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    const scheduled = await this.prisma.club_classes.findMany({
      where: { is_deleted: false, status: 'scheduled', class_date: { lte: today } },
      select: { id: true, class_date: true, start_time: true, end_time: true },
    });

    let ongoing = 0;
    let completed = 0;
    for (const cls of scheduled) {
      if (cls.class_date < today || cls.end_time <= now) {
        await this.prisma.club_classes.update({ where: { id: cls.id }, data: { status: 'completed' } });
        completed++;
      } else if (cls.start_time <= now && cls.end_time > now) {
        await this.prisma.club_classes.update({ where: { id: cls.id }, data: { status: 'ongoing' } });
        ongoing++;
      }
    }
    return { ongoing, completed };
  }

  private async validateReferences(body: Record<string, unknown>) {
    const trainerId = Number(body.trainerId);
    const branchId = Number(body.branchId);
    if (!trainerId || !branchId) {
      throw new BadRequestException('المدرب والفرع مطلوبان');
    }
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_deleted: false },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    if (body.classTypeId) {
      const classType = await this.prisma.club_class_types.findFirst({
        where: { id: Number(body.classTypeId), is_deleted: false, is_active: true },
        include: { eligible_trainers: { select: { trainer_id: true } } },
      });
      if (!classType) throw new NotFoundException('نوع الحصة غير موجود');
      const eligibleIds = classType.eligible_trainers.map((x) => x.trainer_id);
      if (eligibleIds.length && !eligibleIds.includes(trainerId)) {
        throw new BadRequestException('المدرب المختار غير مؤهل لتقديم هذه الحصة');
      }
    }

    if (body.hallId) {
      const hall = await this.prisma.club_halls.findFirst({
        where: { id: Number(body.hallId), is_deleted: false },
      });
      if (!hall) throw new NotFoundException('القاعة غير موجودة');
    }
  }

  async create(body: Record<string, unknown>) {
    if ((!body.className && !body.classTypeId) || !body.classDate || !body.startTime || !body.endTime) {
      throw new BadRequestException('يرجى إدخال جميع الحقول المطلوبة');
    }
    let classType: { id: number; name: string; single_session_price: Prisma.Decimal } | null = null;
    if (body.classTypeId) {
      classType = await this.prisma.club_class_types.findFirst({
        where: { id: Number(body.classTypeId), is_deleted: false, is_active: true },
        select: { id: true, name: true, single_session_price: true },
      });
      if (!classType) throw new NotFoundException('نوع الحصة غير موجود');
    }
    await this.validateReferences(body);
    await this.assertSchedule({
      trainerId: Number(body.trainerId),
      branchId: Number(body.branchId),
      classDate: String(body.classDate),
      startTime: String(body.startTime),
      endTime: String(body.endTime),
      hallId: body.hallId ? Number(body.hallId) : null,
    });

    const maxCapacity = body.maxCapacity != null ? Number(body.maxCapacity) : 10;
    const memberIds = Array.isArray(body.memberIds)
      ? [...new Set(body.memberIds.map((m) => Number(m)).filter((m) => m > 0))]
      : [];

    if (memberIds.length > maxCapacity) {
      throw new BadRequestException(`عدد الأعضاء (${memberIds.length}) يتجاوز السعة القصوى (${maxCapacity})`);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const cls = await tx.club_classes.create({
        data: {
          class_type_id: classType?.id ?? null,
          template_slot_id: body.templateSlotId ? Number(body.templateSlotId) : null,
          class_name: classType?.name ?? String(body.className).trim(),
          description: body.description ? String(body.description) : null,
          trainer_id: Number(body.trainerId),
          branch_id: Number(body.branchId),
          hall_id: body.hallId ? Number(body.hallId) : null,
          class_date: String(body.classDate),
          start_time: String(body.startTime),
          end_time: String(body.endTime),
          max_capacity: maxCapacity,
          price: body.price != null ? Number(body.price) : toNum(classType?.single_session_price),
          notes: body.notes ? String(body.notes) : null,
          status: 'scheduled',
          audience: this.classAudience(body.audience),
        },
      });

      if (memberIds.length > 0) {
        const today = localDateString();
        await tx.club_class_enrollments.createMany({
          data: memberIds.map((memberId) => ({
            class_id: cls.id,
            member_id: memberId,
            enrollment_date: today,
            attendance_status: 'registered' as const,
          })),
        });
      }

      return cls;
    });

    return this.findOne(created.id);
  }

  async update(id: number, body: Record<string, unknown>) {
    const existing = await this.findOne(id);
    if (body.trainerId != null || body.branchId != null || body.hallId != null || body.classTypeId != null) {
      await this.validateReferences({
        trainerId: body.trainerId ?? existing.trainerId,
        branchId: body.branchId ?? existing.branchId,
        hallId: body.hallId,
        classTypeId: body.classTypeId ?? existing.classTypeId,
      });
    }

    const classDate = body.classDate != null ? String(body.classDate) : existing.classDate;
    const startTime = body.startTime != null ? String(body.startTime) : existing.startTime;
    const endTime = body.endTime != null ? String(body.endTime) : existing.endTime;
    const trainerId = body.trainerId != null ? Number(body.trainerId) : existing.trainerId;
    const branchId = body.branchId != null ? Number(body.branchId) : existing.branchId;
    const hallId = body.hallId !== undefined ? (body.hallId ? Number(body.hallId) : null) : existing.hallId;

    if (
      body.trainerId != null ||
      body.classDate != null ||
      body.startTime != null ||
      body.endTime != null ||
      body.hallId !== undefined
    ) {
      await this.assertSchedule(
        { trainerId, branchId, classDate, startTime, endTime, hallId },
        id,
      );
    }

    const prevMaxCapacity = existing.maxCapacity;
    const newMaxCapacity = body.maxCapacity != null ? Number(body.maxCapacity) : prevMaxCapacity;

    if (body.maxCapacity != null) {
      const activeCount = await this.countActiveEnrollments(id);
      if (activeCount > newMaxCapacity) {
        throw new BadRequestException(
          `لا يمكن تقليل السعة — يوجد ${activeCount} تسجيل نشط`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_classes.update({
        where: { id },
        data: {
          ...(body.className != null ? { class_name: String(body.className).trim() } : {}),
          ...(body.classTypeId !== undefined
            ? { class_type_id: body.classTypeId ? Number(body.classTypeId) : null }
            : {}),
          ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
          ...(body.trainerId != null ? { trainer_id: trainerId } : {}),
          ...(body.branchId != null ? { branch_id: branchId } : {}),
          ...(body.hallId !== undefined ? { hall_id: hallId } : {}),
          ...(body.classDate != null ? { class_date: classDate } : {}),
          ...(body.startTime != null ? { start_time: startTime } : {}),
          ...(body.endTime != null ? { end_time: endTime } : {}),
          ...(body.maxCapacity != null ? { max_capacity: newMaxCapacity } : {}),
          ...(body.price != null ? { price: Number(body.price) } : {}),
          ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessClassStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.audience !== undefined ? { audience: this.classAudience(body.audience) } : {}),
          ...(body.cancelledReason !== undefined
            ? { cancelled_reason: body.cancelledReason ? String(body.cancelledReason) : null }
            : {}),
          ...((body.classDate != null || body.startTime != null || body.endTime != null)
            ? { rescheduled_at: new Date() }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
          ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
        },
      });

      if (newMaxCapacity > prevMaxCapacity) {
        let activeCount = await this.countActiveEnrollments(id, tx);
        while (activeCount < newMaxCapacity) {
          const before = activeCount;
          await this.promoteWaitlist(id, tx);
          activeCount = await this.countActiveEnrollments(id, tx);
          if (activeCount === before) break;
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_classes.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }

  async enrollMember(
    classId: number,
    memberId: number,
    options?: { waitlistIfFull?: boolean; force?: boolean; bookingSource?: string; subscriptionId?: number },
  ) {
    const cls = await this.prisma.club_classes.findFirst({
      where: { id: classId, is_deleted: false },
    });
    if (!cls) throw new NotFoundException('الحصة غير موجودة');
    assertNotPastDate(cls.class_date, 'لا يمكن التسجيل في حصة بتاريخ ماضٍ');

    let entitlement;
    let resolvedSubscriptionId = options?.subscriptionId;
    if (cls.class_type_id && !options?.force) {
      const eligibleSubscriptions = await this.prisma.club_subscriptions.findMany({
        where: {
          member_id: memberId,
          type: { class_types: { some: { class_type_id: cls.class_type_id } } },
        },
        select: { id: true },
        orderBy: { subscription_end_date: 'desc' },
      });
      if (options?.subscriptionId && !eligibleSubscriptions.some((sub) => sub.id === options.subscriptionId)) {
        throw new BadRequestException('الاشتراك المختار لا يشمل نوع هذه الحصة');
      }

      const candidateIds = options?.subscriptionId
        ? [options.subscriptionId]
        : eligibleSubscriptions.map((sub) => sub.id);
      let lastResult: Awaited<ReturnType<EntitlementService['validate']>> | null = null;
      for (const subscriptionId of candidateIds) {
        const result = await this.entitlement.validate({
          memberId,
          branchId: cls.branch_id,
          subscriptionId,
          blockOnOutstanding: true,
          requireActiveSubscription: true,
        });
        lastResult = result;
        if (result.allowed) {
          entitlement = result;
          resolvedSubscriptionId = subscriptionId;
          break;
        }
      }
      if (!entitlement) {
        throw new BadRequestException({
          message: eligibleSubscriptions.length
            ? 'لا توجد باقة مؤهلة ونشطة تسمح بهذه الحصة'
            : 'باقة العميل لا تشمل نوع هذه الحصة',
          entitlement: lastResult,
        });
      }
    } else {
      entitlement = await this.entitlement.validate({
        memberId,
        branchId: cls.branch_id,
        subscriptionId: options?.subscriptionId,
        blockOnOutstanding: !options?.force,
        requireActiveSubscription: true,
      });
    }

    if (!entitlement.allowed && !options?.force) {
      throw new BadRequestException({
        message: 'العضو غير مؤهل للتسجيل في الحصة',
        entitlement,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.club_members.findFirst({
        where: { id: memberId, is_deleted: false },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');

      const activeCount = await this.countActiveEnrollments(classId, tx);
      if (activeCount >= cls.max_capacity) {
        if (options?.waitlistIfFull) {
          return this.addToWaitlist(classId, memberId, tx);
        }
        throw new BadRequestException({
          message: 'الحصة ممتلئة',
          code: 'CLASS_FULL',
          waitlistAvailable: true,
        });
      }

      const existing = await tx.club_class_enrollments.findUnique({
        where: { class_id_member_id: { class_id: classId, member_id: memberId } },
      });

      if (existing && isActiveEnrollment(existing.attendance_status)) {
        throw new ConflictException('العضو مسجل بالفعل في هذه الحصة');
      }

      const today = localDateString();
      if (existing) {
        await tx.club_class_enrollments.update({
          where: { id: existing.id },
          data: {
            enrollment_date: today,
            attendance_status: 'registered',
            attendance_time: null,
            booking_source: options?.bookingSource ?? 'reception',
            subscription_id: resolvedSubscriptionId ?? null,
          },
        });
      } else {
        await tx.club_class_enrollments.create({
          data: {
            class_id: classId,
            member_id: memberId,
            enrollment_date: today,
            attendance_status: 'registered',
            booking_source: options?.bookingSource ?? 'reception',
            subscription_id: resolvedSubscriptionId ?? null,
          },
        });
      }

      void this.webhooks.dispatch('class_enrolled', {
        classId,
        memberId,
        memberName: member.name,
        className: cls.class_name,
      });

      return this.findOne(classId);
    });
  }

  private async addToWaitlist(classId: number, memberId: number, tx: Prisma.TransactionClient) {
    const existing = await tx.club_class_waitlist.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (existing && existing.status === 'waiting') {
      throw new ConflictException('العضو موجود بالفعل في قائمة الانتظار');
    }

    const count = await tx.club_class_waitlist.count({
      where: { class_id: classId, status: 'waiting' },
    });

    const row = existing
      ? await tx.club_class_waitlist.update({
          where: { id: existing.id },
          data: { status: 'waiting', position: count + 1 },
        })
      : await tx.club_class_waitlist.create({
          data: {
            class_id: classId,
            member_id: memberId,
            position: count + 1,
            status: 'waiting',
          },
        });

    const member = await tx.club_members.findUnique({ where: { id: memberId } });
    const cls = await tx.club_classes.findUnique({ where: { id: classId } });
    void this.webhooks.dispatch('class_waitlisted', {
      classId,
      memberId,
      memberName: member?.name,
      className: cls?.class_name,
      position: row.position,
    });

    return { waitlisted: true, position: row.position, classId, memberId };
  }

  async listWaitlist(classId: number) {
    const rows = await this.prisma.club_class_waitlist.findMany({
      where: { class_id: classId, status: 'waiting' },
      orderBy: { position: 'asc' },
    });
    const memberIds = rows.map((r) => r.member_id);
    const members =
      memberIds.length > 0
        ? await this.prisma.club_members.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, member_code: true, phone: true },
          })
        : [];
    const byId = new Map(members.map((m) => [m.id, m]));
    return rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      position: r.position,
      member: byId.get(r.member_id) ?? null,
      createdAt: r.created_at,
    }));
  }

  async removeFromWaitlist(classId: number, memberId: number) {
    await this.prisma.club_class_waitlist.updateMany({
      where: { class_id: classId, member_id: memberId, status: 'waiting' },
      data: { status: 'cancelled' },
    });
    return { success: true };
  }

  private async promoteWaitlist(classId: number, tx: Prisma.TransactionClient) {
    const next = await tx.club_class_waitlist.findFirst({
      where: { class_id: classId, status: 'waiting' },
      orderBy: { position: 'asc' },
    });
    if (!next) return;

    const cls = await tx.club_classes.findUnique({ where: { id: classId } });
    if (!cls) return;

    const activeCount = await this.countActiveEnrollments(classId, tx);
    if (activeCount >= cls.max_capacity) return;

    const today = localDateString();
    const existing = await tx.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: next.member_id } },
    });

    if (existing) {
      await tx.club_class_enrollments.update({
        where: { id: existing.id },
        data: { enrollment_date: today, attendance_status: 'registered' },
      });
    } else {
      await tx.club_class_enrollments.create({
        data: {
          class_id: classId,
          member_id: next.member_id,
          enrollment_date: today,
          attendance_status: 'registered',
        },
      });
    }

    await tx.club_class_waitlist.update({
      where: { id: next.id },
      data: { status: 'promoted' },
    });
  }

  async unenrollMember(classId: number, memberId: number) {
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_enrollments.update({
        where: { id: enrollment.id },
        data: { attendance_status: 'cancelled' },
      });
      if (enrollment.attendance_status === 'attended' && enrollment.subscription_id) {
        const subscription = await tx.club_subscriptions.findUnique({
          where: { id: enrollment.subscription_id },
          select: { sessions_used: true },
        });
        if (subscription?.sessions_used && subscription.sessions_used > 0) {
          await tx.club_subscriptions.update({
            where: { id: enrollment.subscription_id },
            data: { sessions_used: { decrement: 1 } },
          });
        }
      }
      await this.promoteWaitlist(classId, tx);
    });

    return this.findOne(classId);
  }

  async updateAttendance(
    classId: number,
    memberId: number,
    body: { attendanceStatus?: string; attendanceTime?: string },
  ) {
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    const nextStatus = body.attendanceStatus ?? enrollment.attendance_status;
    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_enrollments.update({
        where: { id: enrollment.id },
        data: {
          ...(body.attendanceStatus != null ? { attendance_status: body.attendanceStatus as Prisma.EnumClubFitnessEnrollmentStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.attendanceTime !== undefined ? { attendance_time: body.attendanceTime || null } : {}),
        },
      });

      if (enrollment.subscription_id && enrollment.attendance_status !== nextStatus) {
        const subscription = await tx.club_subscriptions.findUnique({
          where: { id: enrollment.subscription_id },
          select: { sessions_used: true, sessions_count: true, is_linked_to_sessions: true },
        });
        if (subscription?.is_linked_to_sessions) {
          if (nextStatus === 'attended' && enrollment.attendance_status !== 'attended') {
            if (subscription.sessions_count != null && subscription.sessions_used >= subscription.sessions_count) {
              throw new BadRequestException('لا توجد حصص متبقية في باقة العميل');
            }
            await tx.club_subscriptions.update({
              where: { id: enrollment.subscription_id },
              data: { sessions_used: { increment: 1 } },
            });
          } else if (enrollment.attendance_status === 'attended' && nextStatus !== 'attended' && subscription.sessions_used > 0) {
            await tx.club_subscriptions.update({
              where: { id: enrollment.subscription_id },
              data: { sessions_used: { decrement: 1 } },
            });
          }
        }
      }
    });

    return this.findOne(classId);
  }

  async receptionCheckIn(classId: number, memberId: number) {
    const existing = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!existing || !isActiveEnrollment(existing.attendance_status)) {
      await this.enrollMember(classId, memberId, { force: true, bookingSource: 'walk_in' });
    }
    return this.updateAttendance(classId, memberId, {
      attendanceStatus: 'attended',
      attendanceTime: new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    });
  }

  async checkInByBarcode(classId: number, memberCode: string) {
    const code = memberCode?.trim();
    if (!code) throw new BadRequestException('كود العضو مطلوب');
    const member = await this.prisma.club_members.findFirst({
      where: { member_code: code, is_active: true, is_deleted: false },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('لم يتم العثور على عضو بهذا الكود');
    const existing = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: member.id } },
    });
    if (!existing || !isActiveEnrollment(existing.attendance_status)) {
      // This is a walk-in, not a reservation.  enrollMember resolves and validates
      // the current eligible subscription before creating the attendance record.
      await this.enrollMember(classId, member.id, { bookingSource: 'barcode' });
    } else {
      if (!existing.subscription_id) {
        throw new BadRequestException('لا يوجد اشتراك فعّال مرتبط بحضور هذه الحصة');
      }
      const cls = await this.prisma.club_classes.findFirst({
        where: { id: classId, is_deleted: false },
        select: { branch_id: true },
      });
      if (!cls) throw new NotFoundException('الحصة غير موجودة');
      const entitlement = await this.entitlement.validate({
        memberId: member.id,
        branchId: cls.branch_id,
        subscriptionId: existing.subscription_id,
        blockOnOutstanding: true,
        requireActiveSubscription: true,
      });
      if (!entitlement.allowed) throw new BadRequestException('الاشتراك الفعّال لا يسمح بدخول هذه الحصة');
    }
    return this.updateAttendance(classId, member.id, {
      attendanceStatus: 'attended',
      attendanceTime: new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
      }),
    });
  }

  /** Scanner flow: infer the single class currently running in the scanner user's branch. */
  async checkInByCurrentBarcode(memberCode: string, userId: number) {
    const code = memberCode?.trim();
    if (!code) throw new BadRequestException('كود العضو مطلوب');

    const scanner = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { branch_id_fk: true },
    });
    let branchId = scanner?.branch_id_fk ?? null;
    if (!branchId) {
      const member = await this.prisma.club_members.findFirst({
        where: { member_code: code, is_active: true, is_deleted: false },
        select: { branch_id: true },
      });
      if (!member) throw new NotFoundException('لم يتم العثور على عضو بهذا الكود');
      branchId = member.branch_id;
    }
    if (!branchId) throw new BadRequestException('تعذر تحديد فرع جهاز الحضور');

    const now = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const running = await this.prisma.club_classes.findMany({
      where: {
        branch_id: branchId,
        class_date: localDateString(),
        start_time: { lte: now },
        end_time: { gte: now },
        status: { in: ['scheduled', 'ongoing'] },
        is_active: true,
        is_deleted: false,
      },
      select: { id: true },
      orderBy: { start_time: 'asc' },
    });
    if (!running.length) throw new BadRequestException('لا توجد حصة جارية الآن في هذا الفرع');
    if (running.length > 1) throw new BadRequestException('توجد أكثر من حصة جارية الآن؛ يلزم فصل أجهزة المسح حسب القاعة');
    return this.checkInByBarcode(running[0].id, code);
  }

  async listAttendanceReport(q: ListClubClassesDto) {
    const classWhere: Prisma.club_classesWhereInput = { is_deleted: false };
    if (q.branch && q.branch !== 'all') classWhere.branch_id = Number(q.branch);
    if (q.dateFrom || q.dateTo) classWhere.class_date = { ...(q.dateFrom ? { gte: q.dateFrom } : {}), ...(q.dateTo ? { lte: q.dateTo } : {}) };
    if (q.classTypeId && q.classTypeId !== 'all') classWhere.class_type_id = Number(q.classTypeId);

    const where: Prisma.club_class_enrollmentsWhereInput = { attendance_status: 'attended', class: classWhere };
    if (q.search?.trim()) {
      const members = await this.prisma.club_members.findMany({
        where: { is_deleted: false, OR: [{ name: { contains: q.search.trim() } }, { member_code: { contains: q.search.trim() } }] },
        select: { id: true },
      });
      where.member_id = { in: members.map((member) => member.id) };
    }
    const [rows, total] = await Promise.all([
      this.prisma.club_class_enrollments.findMany({
        where,
        include: { class: { include: { class_type: { select: { id: true, name: true, color: true } } } } },
        orderBy: { updated_at: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_class_enrollments.count({ where }),
    ]);
    const members = await loadMemberBriefMap(this.prisma, rows.map((row) => row.member_id));
    return paginated(rows.map((row) => ({
      id: row.id, memberId: row.member_id, ...attachMemberBrief(row.member_id, members),
      classId: row.class_id, className: row.class.class_name, classType: row.class.class_type,
      branchId: row.class.branch_id, classDate: row.class.class_date, attendanceTime: row.attendance_time,
      subscriptionId: row.subscription_id,
    })), total, q.page, q.pageSize);
  }

  async generateFromDefault(body: { weekStart?: string; branchId?: number; classTypeId?: number }) {
    const weekStart = String(body.weekStart ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException('تاريخ بداية الأسبوع غير صالح');
    }
    const classTypes = await this.prisma.club_class_types.findMany({
      where: {
        is_deleted: false,
        is_active: true,
        ...(body.classTypeId ? { id: Number(body.classTypeId) } : {}),
      },
      include: {
        trainer_schedule_slots: {
          where: {
            is_active: true,
            ...(body.branchId ? { branch_id: Number(body.branchId) } : {}),
          },
          include: { trainer: true },
          orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const createdIds: number[] = [];
    const skipped: Array<{ slotId: number; className: string; reason: string }> = [];
    const combinations = classTypes.flatMap((classType) =>
      classType.trainer_schedule_slots.map((slot) => ({ classType, trainer: slot.trainer, slot })),
    );
    for (const { classType, trainer, slot } of combinations) {
      const date = new Date(`${weekStart}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + slot.weekday);
      const classDate = date.toISOString().slice(0, 10);
      const trainerId = trainer.id;

      const exists = await this.prisma.club_classes.findFirst({
        where: {
          is_deleted: false,
          OR: [
            {
              trainer_schedule_slot_id: slot.id,
              class_type_id: classType.id,
              class_date: classDate,
            },
            {
              class_type_id: classType.id,
              trainer_id: trainerId,
              class_date: classDate,
              start_time: slot.start_time,
            },
          ],
        },
        select: { id: true },
      });
      if (exists) {
        skipped.push({ slotId: slot.id, className: classType.name, reason: 'تم إنشاء الجلسة مسبقًا' });
        continue;
      }

      const conflict = await this.calendar.detectConflicts({
        classDate,
        startTime: slot.start_time,
        endTime: slot.end_time,
        trainerId,
        hallId: slot.hall_id ?? undefined,
        branchId: slot.branch_id,
      });
      if (conflict.hasConflict) {
        skipped.push({ slotId: slot.id, className: classType.name, reason: 'تعارض مدرب أو قاعة' });
        continue;
      }

      const created = await this.prisma.club_classes.create({
        data: {
          class_type_id: classType.id,
          trainer_schedule_slot_id: slot.id,
          class_name: classType.name,
          trainer_id: trainerId,
          branch_id: slot.branch_id,
          hall_id: slot.hall_id,
          class_date: classDate,
          start_time: slot.start_time,
          end_time: slot.end_time,
          max_capacity: slot.max_capacity,
          price: classType.single_session_price,
          status: 'scheduled',
        },
      });
      createdIds.push(created.id);
    }

    return { created: createdIds.length, createdIds, skippedCount: skipped.length, skipped };
  }

  async managementReports(query?: {
    dateFrom?: string;
    dateTo?: string;
    branchId?: number;
    trainerId?: number;
    classTypeId?: number;
  }) {
    const rows = await this.prisma.club_classes.findMany({
      where: {
        is_deleted: false,
        ...(query?.branchId ? { branch_id: query.branchId } : {}),
        ...(query?.trainerId ? { trainer_id: query.trainerId } : {}),
        ...(query?.classTypeId ? { class_type_id: query.classTypeId } : {}),
        ...((query?.dateFrom || query?.dateTo)
          ? { class_date: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(query.dateTo ? { lte: query.dateTo } : {}) } }
          : {}),
      },
      include: {
        class_type: { select: { id: true, name: true, color: true } },
        trainer: { select: { id: true, name: true, employee_id: true } },
        enrollments: true,
      },
      orderBy: { class_date: 'asc' },
    });
    const trainerIds = [...new Set(rows.map((r) => r.trainer_id))];
    const salaries = trainerIds.length
      ? await this.prisma.club_trainer_salaries.findMany({
          where: { trainer_id: { in: trainerIds }, is_active: true },
          orderBy: { effective_date: 'desc' },
        })
      : [];
    const salaryByTrainer = new Map<number, (typeof salaries)[number]>();
    for (const salary of salaries) if (!salaryByTrainer.has(salary.trainer_id)) salaryByTrainer.set(salary.trainer_id, salary);

    const typeMap = new Map<number | string, any>();
    const trainerMap = new Map<number, any>();
    for (const row of rows) {
      const attended = row.enrollments.filter((e) => e.attendance_status === 'attended').length;
      const absent = row.enrollments.filter((e) => e.attendance_status === 'absent').length;
      const booked = row.enrollments.filter((e) => e.attendance_status !== 'cancelled').length;
      const revenue = toNum(row.price) * attended;
      const typeKey = row.class_type_id ?? `legacy:${row.class_name}`;
      const type = typeMap.get(typeKey) ?? {
        classTypeId: row.class_type_id,
        name: row.class_type?.name ?? row.class_name,
        color: row.class_type?.color ?? '#64748B',
        sessions: 0,
        attendance: 0,
        bookings: 0,
        revenue: 0,
        days: {} as Record<string, number>,
        trainers: {} as Record<string, { id: number; name: string; sessions: number }>,
      };
      type.sessions += 1;
      type.attendance += attended;
      type.bookings += booked;
      type.revenue += revenue;
      const weekday = new Date(`${row.class_date}T12:00:00`).getDay();
      type.days[weekday] = (type.days[weekday] ?? 0) + attended;
      const trainerKey = String(row.trainer_id);
      type.trainers[trainerKey] ??= { id: row.trainer_id, name: row.trainer.name, sessions: 0 };
      type.trainers[trainerKey].sessions += 1;
      typeMap.set(typeKey, type);

      const trainer = trainerMap.get(row.trainer_id) ?? {
        trainerId: row.trainer_id,
        name: row.trainer.name,
        isExternal: row.trainer.employee_id == null,
        sessions: 0,
        completed: 0,
        cancelled: 0,
        minutes: 0,
        trainees: 0,
        attendance: 0,
        noShows: 0,
        revenue: 0,
      };
      trainer.sessions += 1;
      trainer.completed += row.status === 'completed' ? 1 : 0;
      trainer.cancelled += row.status === 'cancelled' ? 1 : 0;
      const [sh, sm] = row.start_time.split(':').map(Number);
      const [eh, em] = row.end_time.split(':').map(Number);
      trainer.minutes += Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
      trainer.trainees += booked;
      trainer.attendance += attended;
      trainer.noShows += absent;
      trainer.revenue += revenue;
      trainerMap.set(row.trainer_id, trainer);
    }

    const classTypes = [...typeMap.values()].map((type) => {
      const dayEntries = Object.entries(type.days) as Array<[string, number]>;
      const topTrainer = Object.values(type.trainers as Record<string, { id: number; name: string; sessions: number }>)
        .sort((a, b) => b.sessions - a.sessions)[0] ?? null;
      const busiestDay = dayEntries.sort((a, b) => b[1] - a[1])[0];
      return {
        classTypeId: type.classTypeId,
        name: type.name,
        color: type.color,
        sessions: type.sessions,
        totalAttendance: type.attendance,
        averageAttendance: type.sessions ? type.attendance / type.sessions : 0,
        busiestWeekday: busiestDay ? Number(busiestDay[0]) : null,
        topTrainer,
        revenue: type.revenue,
        demand: type.bookings,
      };
    });

    const trainers = [...trainerMap.values()].map((trainer) => {
      const salary = salaryByTrainer.get(trainer.trainerId);
      const commissionPercentage = salary ? toNum(salary.class_commission_percentage) : 0;
      return {
        trainerId: trainer.trainerId,
        name: trainer.name,
        sessions: trainer.sessions,
        trainingHours: trainer.minutes / 60,
        totalTrainees: trainer.trainees,
        attendedRegistrations: trainer.attendance,
        revenue: trainer.revenue,
        averageAttendance: trainer.sessions ? trainer.attendance / trainer.sessions : 0,
        adherenceRate: trainer.sessions ? ((trainer.completed + trainer.sessions - trainer.completed - trainer.cancelled) / trainer.sessions) * 100 : 0,
        cancelledSessions: trainer.cancelled,
        noShows: trainer.noShows,
        commissionPercentage,
        commissionValue: trainer.revenue * commissionPercentage / 100,
      };
    });

    return {
      summary: {
        sessions: rows.length,
        attendance: classTypes.reduce((sum, x) => sum + x.totalAttendance, 0),
        demand: classTypes.reduce((sum, x) => sum + x.demand, 0),
        revenue: classTypes.reduce((sum, x) => sum + x.revenue, 0),
      },
      classTypes: classTypes.sort((a, b) => b.sessions - a.sessions),
      trainers: trainers.sort((a, b) => b.sessions - a.sessions),
      revenue: [...classTypes].sort((a, b) => b.revenue - a.revenue),
    };
  }
}
