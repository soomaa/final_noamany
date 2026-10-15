import { eligibleEnrollmentSource } from './class-enrollment-entitlement';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionLifecycleService } from '../club-subscriptions/club-subscription-lifecycle.service';
import { packageSessionValue, attendanceCommission } from './class-attendance-value';
import { ClubReceiptsService } from '../club-subscriptions/club-receipts.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { resolveClubPayments, primaryClubPaymentMethod } from '../club-subscriptions/club-subscription.utils';

@Injectable()
export class ClubClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
    private readonly calendar: ClubCalendarService,
    private readonly webhooks: WebhookService,
    private readonly branchScope: BranchScopeService,
    private readonly lifecycle: ClubSubscriptionLifecycleService,
    private readonly receipts?: ClubReceiptsService,
    private readonly moduleLedger?: ModuleLedgerService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  async permissionResourceForClass(id: number) {
    const row = await this.prisma.club_classes.findFirst({
      where: { id, is_deleted: false },
      select: { class_type_id: true },
    });
    if (!row) throw new NotFoundException('الحصة غير موجودة');
    return row.class_type_id == null
      ? 'club.fitness.personal_sessions'
      : 'club.subscriptions.special';
  }

  private async assertMemberInBranch(memberId: number, branchId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (member.branch_id !== branchId) {
      throw new ForbiddenException('لا يمكن استخدام عضو من فرع آخر في هذه الحصة');
    }
  }

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
      commissionPercentage: row.commission_percentage == null ? null : Number(row.commission_percentage),
      allowExternal: row.allow_external ?? false,
      linkedSubscriptionTypeIds: row.linked_subscription_type_ids ?? [],
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

  async list(q: ListClubClassesDto, user?: JwtUser) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ class_name: { contains: s } }, { description: { contains: s } }] });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    const scope = this.branchScope.resolveListFilter(user, q.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
    if (q.trainer && q.trainer !== 'all') and.push({ trainer_id: Number(q.trainer) });
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessClassStatusFilter['equals'] });
    }
    if (q.audience && q.audience !== 'all') {
      and.push({ audience: q.audience as ClubClassAudience });
    }
    if (q.dateFrom && q.dateTo) {
      and.push({ class_date: { gte: q.dateFrom, lte: q.dateTo } });
    } else if (q.dateFrom) {
      and.push({ class_date: { gte: q.dateFrom } });
    } else if (q.dateTo) {
      and.push({ class_date: { lte: q.dateTo } });
    }
    if (q.personalOnly) and.push({ class_type_id: null });
    else and.push({ class_type_id: { not: null } });

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

  async statistics(
    query?: { branch?: string; trainer?: string; dateFrom?: string; dateTo?: string },
    user?: JwtUser,
  ) {
    const and: Prisma.club_classesWhereInput[] = [{ is_deleted: false }];
    if (query?.branch && query.branch !== 'all') and.push({ branch_id: Number(query.branch) });
    const scope = this.branchScope.resolveListFilter(user, query?.branch ?? null);
    if (scope !== null) and.push({ branch_id: { in: scope } });
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

  async findOne(id: number, user?: JwtUser) {
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
    this.assertBranchAccess(user, row.branch_id);
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
      where: { id: trainerId, is_deleted: false, is_active: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    if (body.classTypeId) {
      const classType = await this.prisma.club_class_types.findFirst({
        where: { id: Number(body.classTypeId), is_deleted: false, is_active: true },
        include: { eligible_trainers: { select: { trainer_id: true } } },
      });
      if (!classType) throw new NotFoundException('نوع الحصة غير موجود');
      if (classType.eligible_trainers.length && !classType.eligible_trainers.some(row => row.trainer_id === trainerId)) throw new BadRequestException('المدرب غير مسؤول عن هذا الكلاس');
    }

    if (body.hallId) {
      const hall = await this.prisma.club_halls.findFirst({
        where: { id: Number(body.hallId), is_deleted: false },
      });
      if (!hall) throw new NotFoundException('القاعة غير موجودة');
    }
  }

  async create(body: Record<string, unknown>, user?: JwtUser) {
    if ((!body.className && !body.classTypeId) || !body.classDate || !body.startTime || !body.endTime) {
      throw new BadRequestException('يرجى إدخال جميع الحقول المطلوبة');
    }
    let classType: Prisma.club_class_typesGetPayload<object> | null = null;
    if (body.classTypeId) {
      classType = await this.prisma.club_class_types.findFirst({
        where: { id: Number(body.classTypeId), is_deleted: false, is_active: true },
      });
      if (!classType) throw new NotFoundException('نوع الحصة غير موجود');
    }
    const branchId = Number(body.branchId);
    this.assertBranchAccess(user, branchId);
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
    const price = body.price != null ? Number(body.price) : toNum(classType?.single_session_price);
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException('سعر الحصة غير صحيح');
    const percentage = body.commissionPercentage == null ? (classType?.commission_percentage == null ? null : Number(classType.commission_percentage)) : Number(body.commissionPercentage);
    if (percentage != null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
      throw new BadRequestException('نسبة الكابتن لازم تكون من صفر إلى 100');
    }
    const memberIds = Array.isArray(body.memberIds)
      ? [...new Set(body.memberIds.map((m) => Number(m)).filter((m) => m > 0))]
      : [];

    await Promise.all(memberIds.map((memberId) => this.assertMemberInBranch(memberId, branchId)));

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
          price,
          commission_percentage: percentage,
          allow_external: body.allowExternal === true || (body.allowExternal == null && classType?.allow_external === true),
          linked_subscription_type_ids: Array.isArray(body.linkedSubscriptionTypeIds) ? body.linkedSubscriptionTypeIds.map(Number) : (classType?.linked_subscription_type_ids ?? []) as Prisma.InputJsonValue,
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

    return this.findOne(created.id, user);
  }

  async update(id: number, body: Record<string, unknown>, user?: JwtUser) {
    if (body.commissionPercentage != null && (!Number.isFinite(Number(body.commissionPercentage)) || Number(body.commissionPercentage) < 0 || Number(body.commissionPercentage) > 100)) throw new BadRequestException('نسبة الكابتن لازم تكون من صفر إلى 100');
    if (body.price != null && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) throw new BadRequestException('سعر الحصة غير صحيح');
    const existing = await this.findOne(id, user);
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
    this.assertBranchAccess(user, branchId);
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
          ...(body.commissionPercentage !== undefined ? { commission_percentage: body.commissionPercentage == null ? null : Number(body.commissionPercentage) } : {}),
          ...(body.allowExternal !== undefined ? { allow_external: body.allowExternal === true } : {}),
          ...(Array.isArray(body.linkedSubscriptionTypeIds) ? { linked_subscription_type_ids: body.linkedSubscriptionTypeIds.map(Number) } : {}),
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

      // Nothing is held back by capacity any more, so anybody still waiting is let in.
      for (let guard = 0; guard < 500; guard++) {
        const promoted = await this.promoteWaitlist(id, tx);
        if (!promoted) break;
      }
    });

    return this.findOne(id, user);
  }

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
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
    user?: JwtUser,
  ) {
    const cls = await this.prisma.club_classes.findFirst({
      where: { id: classId, is_deleted: false },
    });
    if (!cls) throw new NotFoundException('الحصة غير موجودة');
    this.assertBranchAccess(user, cls.branch_id);
    await this.assertMemberInBranch(memberId, cls.branch_id);
    assertNotPastDate(cls.class_date, 'لا يمكن التسجيل في حصة بتاريخ ماضٍ');
    const member = await this.prisma.club_members.findFirst({ where: { id: memberId, is_deleted: false }, select: { gender: true } });
    if ((cls.audience === 'men' && member?.gender !== 'male') || (cls.audience === 'women' && member?.gender !== 'female')) throw new BadRequestException('فئة العضو لا تطابق فئة الحصة');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_classes WHERE id = ${classId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const currentClass = await tx.club_classes.findUnique({ where: { id: classId } });
      if (!currentClass) throw new NotFoundException('الحصة غير موجودة');
      const resolvedSubscriptionId = await eligibleEnrollmentSource(tx, currentClass, memberId, options?.subscriptionId);
      const member = await tx.club_members.findFirst({
        where: { id: memberId, is_deleted: false },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');

      // Capacity is informational: reception lets walk-ins in regardless, so booking must not
      // refuse them either. `max_capacity` stays on the row as the planned headcount.
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

      return this.findOne(classId, user);
    });
  }

  async listWaitlist(classId: number, user?: JwtUser) {
    await this.findOne(classId, user);
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

  async removeFromWaitlist(classId: number, memberId: number, user?: JwtUser) {
    const cls = await this.findOne(classId, user);
    await this.assertMemberInBranch(memberId, cls.branchId);
    await this.prisma.club_class_waitlist.updateMany({
      where: { class_id: classId, member_id: memberId, status: 'waiting' },
      data: { status: 'cancelled' },
    });
    return { success: true };
  }

  private async promoteWaitlist(classId: number, tx: Prisma.TransactionClient) {
    await tx.$queryRaw`SELECT id FROM club_classes WHERE id = ${classId} FOR UPDATE`;
    const cls = await tx.club_classes.findUnique({ where: { id: classId } });
    if (!cls || cls.status !== 'scheduled' || cls.class_date < localDateString()) return false;

    const waiting = await tx.club_class_waitlist.findMany({ where: { class_id: classId, status: 'waiting' }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    for (const next of waiting) {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${next.member_id} FOR UPDATE`;
      const existing = await tx.club_class_enrollments.findUnique({ where: { class_id_member_id: { class_id: classId, member_id: next.member_id } } });
      if (existing && isActiveEnrollment(existing.attendance_status)) {
        await tx.club_class_waitlist.update({ where: { id: next.id }, data: { status: 'cancelled' } });
        continue;
      }
      let subscriptionId: number;
      try { subscriptionId = await eligibleEnrollmentSource(tx, cls, next.member_id); }
      catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        await tx.club_class_waitlist.update({ where: { id: next.id }, data: { status: 'cancelled' } });
        continue;
      }
      const data = { enrollment_date: localDateString(), attendance_status: 'registered' as const, attendance_time: null, subscription_id: subscriptionId };
      if (existing) await tx.club_class_enrollments.update({ where: { id: existing.id }, data });
      else await tx.club_class_enrollments.create({ data: { class_id: classId, member_id: next.member_id, ...data } });
      await tx.club_class_waitlist.update({ where: { id: next.id }, data: { status: 'promoted' } });
      return true;
    }
    return false;
  }

  async unenrollMember(classId: number, memberId: number, user?: JwtUser) {
    const cls = await this.findOne(classId, user);
    await this.assertMemberInBranch(memberId, cls.branchId);
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_classes WHERE id = ${classId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const changed = await tx.club_class_enrollments.updateMany({
        where: { id: enrollment.id, attendance_status: enrollment.attendance_status },
        data: { attendance_status: 'cancelled' },
      });
      if (changed.count !== 1) return;
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

    return this.findOne(classId, user);
  }

  async updateAttendance(
    classId: number,
    memberId: number,
    body: { attendanceStatus?: string; attendanceTime?: string },
    user?: JwtUser,
  ) {
    const cls = await this.findOne(classId, user);
    await this.assertMemberInBranch(memberId, cls.branchId);
    const enrollment = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!enrollment || !isActiveEnrollment(enrollment.attendance_status)) {
      throw new NotFoundException('العضو غير مسجل في هذه الحصة');
    }

    const nextStatus = body.attendanceStatus ?? enrollment.attendance_status;
    const activatedSubscriptionId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_classes WHERE id = ${classId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      if (nextStatus === 'attended' && enrollment.attendance_status !== 'attended') {
        const currentClass = await tx.club_classes.findUnique({ where: { id: classId } });
        if (!currentClass) throw new NotFoundException('الحصة غير موجودة');
        await eligibleEnrollmentSource(tx, currentClass, memberId, enrollment.subscription_id ?? undefined, enrollment.id);
      }

      let snapshot: { session_value_snapshot: number; commission_percentage_snapshot: number; package_value_snapshot: number; package_sessions_snapshot: number } | undefined;
      if (nextStatus === 'attended' && enrollment.attendance_status !== 'attended' && enrollment.session_value_snapshot == null) {
        const subscription = enrollment.subscription_id ? await tx.club_subscriptions.findUnique({
          where: { id: enrollment.subscription_id },
          select: { subscription_value: true, discount_enabled: true, discount_value: true, sessions_count: true },
        }) : null;
        const value = packageSessionValue(subscription);
        const session = await tx.club_classes.findUnique({ where: { id: classId }, select: { commission_percentage: true, trainer_id: true, class_date: true } });
        const salary = session && session.commission_percentage == null ? await tx.club_trainer_salaries.findFirst({
          where: { trainer_id: session.trainer_id, effective_date: { lte: session.class_date } }, orderBy: { effective_date: 'desc' },
        }) : null;
        if (value != null && subscription) snapshot = { session_value_snapshot: value, commission_percentage_snapshot: Number(session?.commission_percentage ?? salary?.class_commission_percentage ?? 0), package_value_snapshot: Number(subscription.subscription_value) - (subscription.discount_enabled ? Number(subscription.discount_value) : 0), package_sessions_snapshot: subscription.sessions_count! };
      }
      const transitioned = await tx.club_class_enrollments.updateMany({
        where: { id: enrollment.id, attendance_status: enrollment.attendance_status },
        data: {
          ...snapshot,
          ...(body.attendanceStatus != null ? { attendance_status: body.attendanceStatus as Prisma.EnumClubFitnessEnrollmentStatusFieldUpdateOperationsInput['set'] } : {}),
          ...(body.attendanceTime !== undefined ? { attendance_time: body.attendanceTime || null } : {}),
        },
      });
      if (transitioned.count !== 1) return null;

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
            const consumed = await tx.club_subscriptions.updateMany({
              where: {
                id: enrollment.subscription_id,
                sessions_used: subscription.sessions_used,
                sessions_count: subscription.sessions_count,
                is_linked_to_sessions: true,
              },
              data: { sessions_used: { increment: 1 } },
            });
            if (consumed.count !== 1) {
              throw new BadRequestException('تم استهلاك آخر حصة بالفعل؛ حدّث الصفحة وحاول مرة أخرى');
            }
            if (
              subscription.sessions_count != null &&
              subscription.sessions_used + 1 >= subscription.sessions_count
            ) {
              const promotion = await this.lifecycle.promoteAfterQuotaExhaustion(
                enrollment.subscription_id,
                localDateString(),
                tx,
              );
              return promotion.activatedSubscriptionId;
            }
          } else if (enrollment.attendance_status === 'attended' && nextStatus !== 'attended' && subscription.sessions_used > 0) {
            await tx.club_subscriptions.update({
              where: { id: enrollment.subscription_id },
              data: { sessions_used: { decrement: 1 } },
            });
          }
        }
      }
      return null;
    });

    if (activatedSubscriptionId) {
      await this.lifecycle.syncActivatedMember(activatedSubscriptionId);
    }

    return this.findOne(classId, user);
  }

  async receptionCheckIn(classId: number, memberId: number, user?: JwtUser, subscriptionId?: number) {
    const cls = await this.findOne(classId, user);
    await this.assertMemberInBranch(memberId, cls.branchId);
    const existing = await this.prisma.club_class_enrollments.findUnique({
      where: { class_id_member_id: { class_id: classId, member_id: memberId } },
    });
    if (!existing || !isActiveEnrollment(existing.attendance_status)) {
      await this.enrollMember(classId, memberId, { force: false, bookingSource: 'walk_in', subscriptionId }, user);
    }
    return this.updateAttendance(classId, memberId, {
      attendanceStatus: 'attended',
      attendanceTime: new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }, user);
  }

  async receptionDay(branchId: number | undefined, user: JwtUser) {
    if (branchId !== undefined) {
      if (!Number.isInteger(branchId) || branchId <= 0) throw new BadRequestException('الفرع غير صحيح');
      this.assertBranchAccess(user, branchId);
    }
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    return this.prisma.club_classes.findMany({ where: {
      is_deleted: false, class_date: localDateString(), status: { not: 'cancelled' },
      ...(scope !== null ? { branch_id: { in: scope } } : {}),
    }, select: { id: true, class_name: true, class_type_id: true, trainer_id: true,
      trainer: { select: { name: true } }, start_time: true, end_time: true, audience: true,
      price: true, allow_external: true, branch_id: true }, orderBy: { start_time: 'asc' } });
  }

  async receptionAttendance(classId: number, body: Record<string, unknown>, user: JwtUser) {
    const identifier = String(body.identifier ?? '').trim().replace(/\s/g, '');
    if (!identifier || identifier.length > 50) throw new BadRequestException('اكتب كود العضو أو رقم الموبايل');
    const cls = await this.prisma.club_classes.findFirst({ where: { id: classId, is_deleted: false } });
    if (!cls) throw new NotFoundException('الحصة غير موجودة');
    this.assertBranchAccess(user, cls.branch_id);
    if (cls.class_date !== localDateString() || cls.status === 'cancelled') throw new BadRequestException('الحضور متاح لحصص اليوم غير الملغاة فقط');
    const members = await this.prisma.club_members.findMany({ where: { is_deleted: false, branch_id: cls.branch_id,
      OR: [{ member_code: identifier }, { phone: identifier }] }, take: 2 });
    if (members.length > 1) throw new BadRequestException('الموبايل مرتبط بأكثر من عضو؛ استخدم كود العضو');
    if (members.length === 1) return this.receptionCheckIn(classId, members[0].id, user, body.subscriptionId ? Number(body.subscriptionId) : undefined);
    if (!cls.allow_external) throw new BadRequestException('الحصة لا تسمح بالحضور الخارجي');
    const name = String(body.name ?? '').trim();
    const gender = String(body.gender ?? '');
    if (!/^\+?\d{8,15}$/.test(identifier) || !name || name.length > 200 || !['male', 'female'].includes(gender)) {
      throw new BadRequestException('للضيف الجديد: اكتب موبايل صحيح والاسم واختر رجالي أو حريمي');
    }
    if ((cls.audience === 'men' && gender !== 'male') || (cls.audience === 'women' && gender !== 'female')) throw new BadRequestException('فئة الضيف لا تطابق فئة الحصة');
    if (!this.receipts || !this.moduleLedger) throw new BadRequestException('خدمة الدفع غير متاحة');
    const rawPayments = body.payments as { method: string; amount: number }[] | undefined;
    const amount = Number(cls.price);
    if (!Number.isFinite(amount) || amount <= 0 || !Array.isArray(rawPayments) || !rawPayments.length || rawPayments.some((p) => !p || !Number.isFinite(p.amount) || p.amount <= 0 || !['cash', 'card', 'visa', 'bank', 'transfer', 'wallet', 'instapay', 'online'].includes(p.method))) throw new BadRequestException('سجل دفع سعر الحصة بالكامل');
    const payments = resolveClubPayments(amount, null, rawPayments);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM club_classes WHERE id = ${classId} FOR UPDATE`);
      const current = await tx.club_classes.findUnique({ where: { id: classId } });
      if (!current || current.is_deleted || current.status === 'cancelled' || current.class_date !== localDateString() || !current.allow_external || Number(current.price) !== amount) throw new BadRequestException('بيانات الحصة اتغيرت؛ حدّث الصفحة');
      const existing = await tx.club_class_guest_attendance.findUnique({ where: { class_id_phone: { class_id: classId, phone: identifier } } });
      if (existing) return { alreadyAttended: true, receiptId: existing.receipt_id };
      const salary = current.commission_percentage == null ? await tx.club_trainer_salaries.findFirst({ where: { trainer_id: current.trainer_id, effective_date: { lte: current.class_date } }, orderBy: { effective_date: 'desc' } }) : null;
      const receipt = await tx.club_receipts.create({ data: {
        receipt_number: await this.receipts!.nextReceiptNumber(tx), member_name: name,
        branch_id: cls.branch_id, amount, type: 'حصة خارجية', receipt_date: localDateString(),
        status: 'مدفوعة', payment_method: primaryClubPaymentMethod(payments), created_by: user.sub,
        description: `${cls.class_name} — ${identifier}`, payments: { create: payments },
      } });
      await tx.club_class_guest_attendance.create({ data: { class_id: classId, name, phone: identifier, gender,
        amount, commission_percentage: current.commission_percentage ?? salary?.class_commission_percentage ?? 0,
        receipt_id: receipt.id, created_by: user.sub } });
      for (const [index, payment] of payments.entries()) await this.moduleLedger!.postOtherRevenue({
        sourceRef: `CLASS-GUEST-${receipt.id}-${index}`, branchId: cls.branch_id, date: localDateString(), amount: payment.amount,
        paymentMethod: payment.method, createdBy: user.sub, description: `حضور خارجي ${cls.class_name} — ${receipt.receipt_number}`,
      }, tx);
      return { success: true, receiptNumber: receipt.receipt_number };
    });
  }

  async generateFromDefault(
    body: { weekStart?: string; branchId?: number; classTypeId?: number },
    user?: JwtUser,
  ) {
    const weekStart = String(body.weekStart ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      throw new BadRequestException('تاريخ بداية الأسبوع غير صالح');
    }
    if (body.branchId) this.assertBranchAccess(user, Number(body.branchId));
    const scope = this.branchScope.resolveListFilter(user, body.branchId ?? null);
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
            ...(scope !== null ? { branch_id: { in: scope } } : {}),
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
          allow_external: classType.allow_external,
          linked_subscription_type_ids: classType.linked_subscription_type_ids ?? Prisma.JsonNull,
          commission_percentage: classType.commission_percentage,
          status: 'scheduled',
          // Each weekly slot carries its own audience (men / women / kids / mixed).
          audience: slot.audience,
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
  }, user?: JwtUser) {
    if (query?.branchId) this.assertBranchAccess(user, query.branchId);
    const scope = this.branchScope.resolveListFilter(user, query?.branchId ?? null);
    const rows = await this.prisma.club_classes.findMany({
      where: {
        is_deleted: false,
        ...(query?.branchId ? { branch_id: query.branchId } : {}),
        ...(scope !== null ? { branch_id: { in: scope } } : {}),
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
          where: { trainer_id: { in: trainerIds } },
          orderBy: { effective_date: 'desc' },
        })
      : [];
    const salaryByTrainer = new Map<number, (typeof salaries)[number]>();
    for (const salary of salaries) if (!salaryByTrainer.has(salary.trainer_id)) salaryByTrainer.set(salary.trainer_id, salary);

    const subscriptionIds = [...new Set(rows.flatMap((row) => row.enrollments.map((e) => e.subscription_id)).filter((id): id is number => id != null))];
    const subscriptions = subscriptionIds.length ? await this.prisma.club_subscriptions.findMany({
      where: { id: { in: subscriptionIds } },
      select: { id: true, subscription_number: true, subscription_type: true, subscription_value: true, discount_enabled: true, discount_value: true, sessions_count: true },
    }) : [];
    const subscriptionMap = new Map(subscriptions.map((s) => [s.id, s]));
    const memberMap = await loadMemberBriefMap(this.prisma, rows.flatMap((row) => row.enrollments.map((e) => e.member_id)));
    const guests = rows.length ? await this.prisma.club_class_guest_attendance.findMany({ where: { class_id: { in: rows.map((row) => row.id) } } }) : [];
    const sessionHistory = rows.filter((row) => row.status !== 'cancelled').map((row) => {
      const effectiveSalary = salaries.find((salary) => salary.trainer_id === row.trainer_id && salary.effective_date <= row.class_date);
      const defaultPercentage = Number(row.commission_percentage ?? effectiveSalary?.class_commission_percentage ?? 0);
      const attendees = row.enrollments.filter((e) => e.attendance_status === 'attended').map((e) => {
        const subscription = e.subscription_id ? subscriptionMap.get(e.subscription_id) : undefined;
        const value = e.session_value_snapshot != null ? Number(e.session_value_snapshot) : packageSessionValue(subscription);
        const percentage = Number(e.commission_percentage_snapshot ?? defaultPercentage);
        const member = memberMap.get(e.member_id);
        return { enrollmentId: e.id, memberId: e.member_id, memberName: member?.name ?? `#${e.member_id}`,
          subscriptionNumber: subscription?.subscription_number ?? null, subscriptionType: subscription?.subscription_type ?? null,
          packageValue: e.package_value_snapshot != null ? Number(e.package_value_snapshot) : subscription ? Number(subscription.subscription_value) - (subscription.discount_enabled ? Number(subscription.discount_value) : 0) : null,
          packageSessions: e.package_sessions_snapshot ?? subscription?.sessions_count ?? null, sessionValue: value, percentage,
          commission: value == null ? null : attendanceCommission(value, percentage),
          historicalEstimate: e.session_value_snapshot == null,
        };
      });
      for (const guest of guests.filter((g) => g.class_id === row.id)) attendees.push({
        enrollmentId: -guest.id, memberId: 0, memberName: `${guest.name} (خارجي)`, subscriptionNumber: `إيصال #${guest.receipt_id}`,
        subscriptionType: 'دفع سعر الحصة', packageValue: Number(guest.amount), packageSessions: 1,
        sessionValue: Number(guest.amount), percentage: Number(guest.commission_percentage),
        commission: attendanceCommission(Number(guest.amount), Number(guest.commission_percentage)), historicalEstimate: false,
      });
      return { id: row.id, className: row.class_name, classDate: row.class_date, startTime: row.start_time, endTime: row.end_time,
        trainerId: row.trainer_id, trainerName: row.trainer.name, status: row.status, percentage: defaultPercentage,
        attendance: attendees.length, revenue: Math.round(attendees.reduce((sum, a) => sum + (a.sessionValue ?? 0), 0) * 100) / 100,
        commission: Math.round(attendees.reduce((sum, a) => sum + (a.commission ?? 0), 0) * 100) / 100,
        unresolvedValues: attendees.filter((a) => a.sessionValue == null).length, attendees };
    });
    const historyMap = new Map(sessionHistory.map((s) => [s.id, s]));

    const typeMap = new Map<number | string, any>();
    const trainerMap = new Map<number, any>();
    for (const row of rows) {
      const attended = historyMap.get(row.id)?.attendance ?? 0;
      const absent = row.enrollments.filter((e) => e.attendance_status === 'absent').length;
      const booked = row.enrollments.filter((e) => e.attendance_status !== 'cancelled').length;
      const revenue = historyMap.get(row.id)?.revenue ?? 0;
      const typeKey = row.class_type_id ?? `legacy:${row.class_name}`;
      const type = typeMap.get(typeKey) ?? {
        classTypeId: row.class_type_id,
        name: row.class_type?.name ?? row.class_name,
        color: row.class_type?.color ?? '#64748B',
        sessions: 0,
        attendance: 0,
        bookings: 0,
        revenue: 0,
        commissionValue: 0,
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
      trainer.commissionValue = (trainer.commissionValue ?? 0) + (historyMap.get(row.id)?.commission ?? 0);
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
      const commissionPercentage = trainer.revenue > 0 ? Math.round((trainer.commissionValue ?? 0) / trainer.revenue * 10000) / 100 : salary ? toNum(salary.class_commission_percentage) : 0;
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
        commissionValue: Math.round(trainer.commissionValue * 100) / 100,
      };
    });

    return {
      sessionHistory: sessionHistory.sort((a, b) => b.classDate.localeCompare(a.classDate) || a.startTime.localeCompare(b.startTime)),
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
