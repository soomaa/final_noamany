import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClubClassAudience, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { toNum } from './club-fitness.utils';

@Injectable()
export class ClubClassTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** A branch-scoped user only sees (and edits) the weekly slots of their own branches. */
  private include(user?: JwtUser): Prisma.club_class_typesInclude {
    const allowed = this.branchScope.allowedBranchIds(user);
    return {
      eligible_trainers: {
        include: { trainer: { select: { id: true, name: true, phone: true, is_active: true } } },
      },
      trainer_schedule_slots: {
        ...(allowed !== null ? { where: { branch_id: { in: allowed } } } : {}),
        include: { hall: { select: { id: true, name: true, hall_number: true } } },
        orderBy: [{ trainer_id: 'asc' }, { weekday: 'asc' }, { start_time: 'asc' }],
      },
      _count: { select: { sessions: true, subscription_types: true } },
    };
  }

  private assertScheduleAccess(user: JwtUser | undefined, branchIds: number[]) {
    if (branchIds.some((branchId) => !this.branchScope.isBranchAllowed(user, branchId))) {
      throw new ForbiddenException('لا تملك صلاحية إدارة جدول حصص فرع آخر');
    }
  }

  /** Existing weekly slots of this class in branches the user may not manage. */
  private async foreignScheduleSlots(id: number, user?: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed === null) return [];
    return this.prisma.club_trainer_schedule_slots.findMany({
      where: { class_type_id: id, branch_id: { notIn: allowed } },
      select: { id: true, trainer_id: true, branch_id: true },
    });
  }

  private map(row: any) {
    const trainerScheduleSlots = row.trainer_schedule_slots.map((slot: any) => ({
      id: slot.id,
      classTypeId: slot.class_type_id,
      trainerId: slot.trainer_id,
      weekday: slot.weekday,
      startTime: slot.start_time,
      endTime: slot.end_time,
      branchId: slot.branch_id,
      hallId: slot.hall_id,
      maxCapacity: slot.max_capacity,
      audience: slot.audience ?? 'mixed',
      hall: slot.hall
        ? { id: slot.hall.id, name: slot.hall.name, hallNumber: slot.hall.hall_number }
        : null,
    }));
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      defaultDurationMinutes: row.default_duration_minutes,
      singleSessionPrice: toNum(row.single_session_price),
      allowExternal: row.allow_external,
      linkedSubscriptionTypeIds: row.linked_subscription_type_ids ?? [],
      commissionPercentage: row.commission_percentage == null ? null : Number(row.commission_percentage),
      useDefaultSchedule: false,
      isActive: row.is_active,
      eligibleTrainerIds: row.eligible_trainers.map((x: any) => x.trainer_id),
      eligibleTrainers: row.eligible_trainers.map((x: any) => x.trainer),
      scheduleSlots: [],
      trainerScheduleSlots,
      sessionsCount: row._count.sessions,
      packagesCount: row._count.subscription_types,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(includeInactive = false, user?: JwtUser) {
    const rows = await this.prisma.club_class_types.findMany({
      where: { is_deleted: false, ...(includeInactive ? {} : { is_active: true }) },
      include: this.include(user),
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_class_types.findFirst({
      where: { id, is_deleted: false },
      include: this.include(user),
    });
    if (!row) throw new NotFoundException('نوع الحصة غير موجود');
    return this.map(row);
  }

  private parse(body: Record<string, unknown>, coveredTrainerIds: number[] = []) {
    const name = String(body.name ?? '').trim();
    const color = String(body.color ?? '#2563EB').trim();
    const defaultDurationMinutes = Number(body.defaultDurationMinutes ?? 60);
    const eligibleTrainerIds = [
      ...new Set(
        (Array.isArray(body.eligibleTrainerIds) ? body.eligibleTrainerIds : [])
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const singleSessionPrice = Number(body.singleSessionPrice ?? body.price ?? 0);
    const commission = body.commissionPercentage == null ? null : Number(body.commissionPercentage);
    if (commission != null && (!Number.isFinite(commission) || commission < 0 || commission > 100)) throw new BadRequestException('نسبة الكابتن غير صالحة');
    const linkedIds = Array.isArray(body.linkedSubscriptionTypeIds) ? [...new Set(body.linkedSubscriptionTypeIds.map(Number))] : [];
    if (linkedIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new BadRequestException('الاشتراكات المرتبطة غير صالحة');

    if (!name) throw new BadRequestException('اسم الحصة مطلوب');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequestException('لون الحصة غير صالح');
    if (!Number.isInteger(defaultDurationMinutes) || defaultDurationMinutes < 5 || defaultDurationMinutes > 480) {
      throw new BadRequestException('مدة الحصة يجب أن تكون بين 5 و480 دقيقة');
    }
    if (!Number.isFinite(singleSessionPrice) || singleSessionPrice < 0) {
      throw new BadRequestException('سعر الحصة الواحدة غير صالح');
    }
    if (!eligibleTrainerIds.length) throw new BadRequestException('اختر مدربًا واحدًا على الأقل');

    const trainerScheduleSlots = this.parseTrainerScheduleSlots(body, eligibleTrainerIds, coveredTrainerIds);

    return {
      data: {
        name,
        color,
        default_duration_minutes: defaultDurationMinutes,
        single_session_price: singleSessionPrice,
        allow_external: body.allowExternal === true,
        linked_subscription_type_ids: linkedIds,
        commission_percentage: commission,
        use_default_schedule: false,
        is_active: body.isActive !== false,
      },
      eligibleTrainerIds,
      trainerScheduleSlots,
    };
  }

  /**
   * `coveredTrainerIds` are trainers that already keep a slot the caller cannot see (another
   * branch's schedule), so they do not need a new slot in this request.
   */
  private parseTrainerScheduleSlots(
    body: Record<string, unknown>,
    eligibleTrainerIds: number[],
    coveredTrainerIds: number[] = [],
  ) {
    const raw = Array.isArray(body.trainerSchedules) ? body.trainerSchedules : [];
    const rows: Array<{
      trainer_id: number;
      weekday: number;
      start_time: string;
      end_time: string;
      branch_id: number;
      hall_id: number | null;
      max_capacity: number;
      audience: ClubClassAudience;
      is_active: boolean;
    }> = [];

    for (const group of raw as Array<Record<string, unknown>>) {
      const trainerId = Number(group.trainerId);
      if (!eligibleTrainerIds.includes(trainerId)) {
        throw new BadRequestException('جدول المدرب يجب أن يكون لمدرب مختار داخل الحصة');
      }
      const slots = Array.isArray(group.slots) ? group.slots : [];
      for (const slot of slots as Array<Record<string, unknown>>) {
        const weekday = Number(slot.weekday);
        const branchId = Number(slot.branchId);
        const hallId = slot.hallId ? Number(slot.hallId) : null;
        const startTime = String(slot.startTime ?? '');
        const endTime = String(slot.endTime ?? '');
        const audience = String(slot.audience ?? 'mixed') as ClubClassAudience;
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
          throw new BadRequestException('يوم الجدول الأسبوعي غير صالح');
        }
        if (!branchId || !startTime || !endTime) {
          throw new BadRequestException('اليوم والوقت والفرع مطلوبة لكل موعد');
        }
        if (endTime <= startTime) throw new BadRequestException('وقت النهاية يجب أن يكون بعد البداية');
        if (!Object.values(ClubClassAudience).includes(audience)) {
          throw new BadRequestException('تصنيف الحصة يجب أن يكون رجال أو سيدات أو أطفال أو مختلط');
        }
        rows.push({
          trainer_id: trainerId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          branch_id: branchId,
          hall_id: hallId,
          max_capacity: Math.max(1, Number(slot.maxCapacity ?? 10)),
          audience,
          is_active: true,
        });
      }
    }

    const trainerIdsWithSlots = new Set([...rows.map((slot) => slot.trainer_id), ...coveredTrainerIds]);
    for (const trainerId of eligibleTrainerIds) {
      if (!trainerIdsWithSlots.has(trainerId)) {
        throw new BadRequestException('أضف موعدًا افتراضيًا واحدًا على الأقل لكل مدرب مختار');
      }
    }

    const keys = new Set<string>();
    for (const slot of rows) {
      const key = `${slot.trainer_id}:${slot.weekday}:${slot.start_time}:${slot.branch_id}`;
      if (keys.has(key)) throw new BadRequestException('يوجد موعد مكرر لنفس المدرب داخل الحصة');
      keys.add(key);
    }
    return rows;
  }

  private async assertReferences(
    trainerIds: number[],
    scheduleSlots: Array<{ branch_id: number; hall_id: number | null }>,
  ) {
    const trainers = await this.prisma.club_trainers.count({
      where: { id: { in: trainerIds }, is_deleted: false, is_active: true },
    });
    if (trainers !== trainerIds.length) throw new BadRequestException('يوجد مدرب غير صالح في الاختيارات');

    const branchIds = [...new Set(scheduleSlots.map((slot) => slot.branch_id))];
    if (branchIds.length) {
      const branches = await this.prisma.tbl_branches.count({ where: { branch_id: { in: branchIds } } });
      if (branches !== branchIds.length) throw new BadRequestException('يوجد فرع غير صالح في الجداول');
    }

    const hallIds = [...new Set(scheduleSlots.map((slot) => slot.hall_id).filter((id): id is number => id != null))];
    if (hallIds.length) {
      const halls = await this.prisma.club_halls.count({ where: { id: { in: hallIds }, is_deleted: false } });
      if (halls !== hallIds.length) throw new BadRequestException('توجد قاعة غير صالحة في الجداول');
    }
  }

  async create(body: Record<string, unknown>, user?: JwtUser) {
    const parsed = this.parse(body);
    this.assertScheduleAccess(user, parsed.trainerScheduleSlots.map((slot) => slot.branch_id));
    await this.assertReferences(parsed.eligibleTrainerIds, parsed.trainerScheduleSlots);
    const duplicate = await this.prisma.club_class_types.findFirst({
      where: { name: parsed.data.name, is_deleted: false },
    });
    if (duplicate) throw new BadRequestException('اسم الحصة مستخدم بالفعل');

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_class_types.create({ data: parsed.data });
      if (parsed.eligibleTrainerIds.length) {
        await tx.club_class_type_trainers.createMany({
          data: parsed.eligibleTrainerIds.map((trainer_id) => ({ class_type_id: created.id, trainer_id })),
        });
      }
      if (parsed.trainerScheduleSlots.length) {
        await tx.club_trainer_schedule_slots.createMany({
          data: parsed.trainerScheduleSlots.map((slot) => ({ ...slot, class_type_id: created.id })),
        });
      }
      return created;
    });
    return this.findOne(row.id, user);
  }

  /**
   * A branch-scoped editor replaces only their own branches' weekly slots. Slots of other
   * branches stay untouched (they were never shown to this editor), and a trainer who still
   * teaches there cannot be removed from the class from here.
   */
  async update(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findOne(id, user);
    const foreignSlots = await this.foreignScheduleSlots(id, user);
    const parsed = this.parse(body, foreignSlots.map((slot) => slot.trainer_id));
    this.assertScheduleAccess(user, parsed.trainerScheduleSlots.map((slot) => slot.branch_id));
    if (foreignSlots.some((slot) => !parsed.eligibleTrainerIds.includes(slot.trainer_id))) {
      throw new ForbiddenException('لا يمكن إزالة مدرب له مواعيد في جدول فرع آخر');
    }
    await this.assertReferences(parsed.eligibleTrainerIds, parsed.trainerScheduleSlots);
    const keptSlotIds = foreignSlots.map((slot) => slot.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_types.update({ where: { id }, data: parsed.data });
      await tx.club_class_type_trainers.deleteMany({ where: { class_type_id: id } });
      await tx.club_trainer_schedule_slots.deleteMany({
        where: { class_type_id: id, ...(keptSlotIds.length ? { id: { notIn: keptSlotIds } } : {}) },
      });
      if (parsed.eligibleTrainerIds.length) {
        await tx.club_class_type_trainers.createMany({
          data: parsed.eligibleTrainerIds.map((trainer_id) => ({ class_type_id: id, trainer_id })),
        });
      }
      if (parsed.trainerScheduleSlots.length) {
        await tx.club_trainer_schedule_slots.createMany({
          data: parsed.trainerScheduleSlots.map((slot) => ({ ...slot, class_type_id: id })),
        });
      }
    });
    return this.findOne(id, user);
  }

  async remove(id: number, user?: JwtUser) {
    await this.findOne(id, user);
    if ((await this.foreignScheduleSlots(id, user)).length) {
      throw new ForbiddenException('لا تملك صلاحية إدارة جدول حصص فرع آخر');
    }
    await this.prisma.club_class_types.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }
}
