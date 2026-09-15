import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toNum } from './club-fitness.utils';

@Injectable()
export class ClubClassTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private include(): Prisma.club_class_typesInclude {
    return {
      eligible_trainers: {
        include: { trainer: { select: { id: true, name: true, phone: true, is_active: true } } },
      },
      trainer_schedule_slots: {
        include: { hall: { select: { id: true, name: true, hall_number: true } } },
        orderBy: [{ trainer_id: 'asc' }, { weekday: 'asc' }, { start_time: 'asc' }],
      },
      _count: { select: { sessions: true, subscription_types: true } },
    };
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

  async list(includeInactive = false) {
    const rows = await this.prisma.club_class_types.findMany({
      where: { is_deleted: false, ...(includeInactive ? {} : { is_active: true }) },
      include: this.include(),
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async findOne(id: number) {
    const row = await this.prisma.club_class_types.findFirst({
      where: { id, is_deleted: false },
      include: this.include(),
    });
    if (!row) throw new NotFoundException('نوع الحصة غير موجود');
    return this.map(row);
  }

  private parse(body: Record<string, unknown>) {
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

    if (!name) throw new BadRequestException('اسم الحصة مطلوب');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequestException('لون الحصة غير صالح');
    if (!Number.isInteger(defaultDurationMinutes) || defaultDurationMinutes < 5 || defaultDurationMinutes > 480) {
      throw new BadRequestException('مدة الحصة يجب أن تكون بين 5 و480 دقيقة');
    }
    if (!Number.isFinite(singleSessionPrice) || singleSessionPrice < 0) {
      throw new BadRequestException('سعر الحصة الواحدة غير صالح');
    }
    if (!eligibleTrainerIds.length) throw new BadRequestException('اختر مدربًا واحدًا على الأقل');

    const trainerScheduleSlots = this.parseTrainerScheduleSlots(body, eligibleTrainerIds);

    return {
      data: {
        name,
        color,
        default_duration_minutes: defaultDurationMinutes,
        single_session_price: singleSessionPrice,
        use_default_schedule: false,
        is_active: body.isActive !== false,
      },
      eligibleTrainerIds,
      trainerScheduleSlots,
    };
  }

  private parseTrainerScheduleSlots(body: Record<string, unknown>, eligibleTrainerIds: number[]) {
    const raw = Array.isArray(body.trainerSchedules) ? body.trainerSchedules : [];
    const rows: Array<{
      trainer_id: number;
      weekday: number;
      start_time: string;
      end_time: string;
      branch_id: number;
      hall_id: number | null;
      max_capacity: number;
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
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
          throw new BadRequestException('يوم الجدول الأسبوعي غير صالح');
        }
        if (!branchId || !startTime || !endTime) {
          throw new BadRequestException('اليوم والوقت والفرع مطلوبة لكل موعد');
        }
        if (endTime <= startTime) throw new BadRequestException('وقت النهاية يجب أن يكون بعد البداية');
        rows.push({
          trainer_id: trainerId,
          weekday,
          start_time: startTime,
          end_time: endTime,
          branch_id: branchId,
          hall_id: hallId,
          max_capacity: Math.max(1, Number(slot.maxCapacity ?? 10)),
          is_active: true,
        });
      }
    }

    const trainerIdsWithSlots = new Set(rows.map((slot) => slot.trainer_id));
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

  async create(body: Record<string, unknown>) {
    const parsed = this.parse(body);
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
    return this.findOne(row.id);
  }

  async update(id: number, body: Record<string, unknown>) {
    await this.findOne(id);
    const parsed = this.parse(body);
    await this.assertReferences(parsed.eligibleTrainerIds, parsed.trainerScheduleSlots);

    await this.prisma.$transaction(async (tx) => {
      await tx.club_class_types.update({ where: { id }, data: parsed.data });
      await tx.club_class_type_trainers.deleteMany({ where: { class_type_id: id } });
      await tx.club_trainer_schedule_slots.deleteMany({ where: { class_type_id: id } });
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
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_class_types.update({
      where: { id },
      data: { is_deleted: true, is_active: false },
    });
    return { success: true };
  }
}
