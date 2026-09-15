import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { PushService } from '../push/push.service';
import {
  CreateTaskDto,
  ListTasksDto,
  TaskActionDto,
  TaskMokalfaDto,
  UpdateTaskDto,
} from './dto/tasks.dto';

/** action_moder_rad accepted values (enum('wait','accepted','refused')). */
const DECISIONS = ['wait', 'accepted', 'refused'] as const;
type Decision = (typeof DECISIONS)[number];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(q: ListTasksDto) {
    const and: Prisma.hr_mosalatWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ details: { contains: s } }, { emp_name: { contains: s } }] });
    }
    // status filters action_moder_rad ('wait' | 'accepted' | 'refused')
    if (q.status && (DECISIONS as readonly string[]).includes(q.status)) {
      and.push({ action_moder_rad: q.status });
    }

    const where: Prisma.hr_mosalatWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_mosalat.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mosalat.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      rkm: row.mosala_rkm,
      date: row.mosala_date_ar,
      time: row.mosala_time,
      empName: row.emp_name ?? '',
      empId: row.emp_name_id,
      edara: row.emp_edara ?? '',
      qesm: row.emp_qesm ?? '',
      details: row.details ?? '',
      publisherName: row.publisher_name ?? '',
      decision: (row.action_moder_rad ?? 'wait') as Decision,
      decisionNotes: row.action_moder_notes,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Employee-app view: only tasks addressed to the employee or published by this account. */
  async listForUser(q: ListTasksDto, user: JwtUser) {
    const account = await this.prisma.users.findUnique({
      where: { user_id: user.sub },
      select: { emp_code: true },
    });
    const link = account?.emp_code ?? user.emp_code;
    const emp = link == null
      ? null
      : await this.prisma.employees.findFirst({
          where: { OR: [{ id: link }, { emp_code: link }] },
          select: { id: true },
        });

    const and: Prisma.hr_mosalatWhereInput[] = [
      { OR: [{ publisher: user.sub }, ...(emp ? [{ emp_name_id: emp.id }] : [])] },
    ];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ details: { contains: s } }, { emp_name: { contains: s } }] });
    }
    if (q.status && (DECISIONS as readonly string[]).includes(q.status)) {
      and.push({ action_moder_rad: q.status });
    }

    const where: Prisma.hr_mosalatWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.hr_mosalat.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_mosalat.count({ where }),
    ]);
    const data = rows.map((row) => ({
      id: row.id,
      rkm: row.mosala_rkm,
      date: row.mosala_date_ar,
      time: row.mosala_time,
      empName: row.emp_name ?? '',
      empId: row.emp_name_id,
      edara: row.emp_edara ?? '',
      qesm: row.emp_qesm ?? '',
      details: row.details ?? '',
      publisherName: row.publisher_name ?? '',
      decision: (row.action_moder_rad ?? 'wait') as Decision,
      decisionNotes: row.action_moder_notes,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const task = await this.findOrThrow(id);
    const mokalfat = await this.prisma.hr_mosalat_mokalfat.findMany({
      where: { mosala_id_fk: id },
      orderBy: { id: 'asc' },
    });
    return {
      id: task.id,
      rkm: task.mosala_rkm,
      date: task.mosala_date_ar,
      time: task.mosala_time,
      empName: task.emp_name ?? '',
      empId: task.emp_name_id,
      edara: task.emp_edara ?? '',
      qesm: task.emp_qesm ?? '',
      details: task.details ?? '',
      publisher: task.publisher,
      publisherName: task.publisher_name ?? '',
      decision: (task.action_moder_rad ?? 'wait') as Decision,
      decisionDate: task.action_moder_date,
      decisionTime: task.action_moder_time,
      decisionNotes: task.action_moder_notes,
      mokalfat: mokalfat.map((m) => ({
        id: m.id,
        name: m.mokalfa_name ?? '',
        notes: m.mokalfa_notes ?? '',
      })),
    };
  }

  /**
   * Faithful port of legacy Api Add_Task:
   *  - stamps mosala_date_ar/mosala_time with "now"
   *  - publisher = current user, publisher_name = user.name
   *  - mosala_rkm = max(mosala_rkm) + 1 (sequential task number)
   *  - persists each مكلّف row into hr_mosalat_mokalfat
   */
  async create(dto: CreateTaskDto, user: JwtUser) {
    const now = new Date();
    const dateAr = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const time = now.toTimeString().slice(0, 5); // 'HH:MM'

    const agg = await this.prisma.hr_mosalat.aggregate({ _max: { mosala_rkm: true } });
    const nextRkm = (agg._max.mosala_rkm ?? 0) + 1;

    const task = await this.prisma.hr_mosalat.create({
      data: {
        mosala_rkm: nextRkm,
        mosala_date_ar: dateAr,
        mosala_time: time,
        emp_name: dto.empName,
        emp_name_id: dto.empId ?? null,
        emp_edara: dto.edara ?? null,
        emp_qesm: dto.qesm ?? null,
        details: dto.details,
        publisher: user.sub,
        publisher_name: user.name ?? '',
        action_moder_rad: 'wait',
      },
    });

    await this.syncMokalfat(task.id, dto.mokalfat);

    return { id: task.id };
  }

  async update(id: number, dto: UpdateTaskDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_mosalat.update({
      where: { id },
      data: {
        ...(dto.empId !== undefined ? { emp_name_id: dto.empId } : {}),
        ...(dto.empName != null ? { emp_name: dto.empName } : {}),
        ...(dto.edara != null ? { emp_edara: dto.edara } : {}),
        ...(dto.qesm != null ? { emp_qesm: dto.qesm } : {}),
        ...(dto.details != null ? { details: dto.details } : {}),
      },
    });

    // mokalfat sent → replace the whole set (legacy edits the full list).
    if (dto.mokalfat) {
      await this.prisma.hr_mosalat_mokalfat.deleteMany({ where: { mosala_id_fk: id } });
      await this.syncMokalfat(id, dto.mokalfat);
    }

    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_mosalat_mokalfat.deleteMany({ where: { mosala_id_fk: id } });
    await this.prisma.hr_mosalat.delete({ where: { id } });
    return { id };
  }

  /**
   * Manager decision: set action_moder_rad to accepted/refused and stamp
   * action_moder_date/time/notes (mirrors legacy moder action endpoint).
   */
  async action(id: number, dto: TaskActionDto, actorUserId?: number) {
    const task = await this.findOrThrow(id);
    const now = new Date();
    await this.prisma.hr_mosalat.update({
      where: { id },
      data: {
        action_moder_rad: dto.decision,
        action_moder_date: now.toISOString().slice(0, 10),
        action_moder_time: now.toTimeString().slice(0, 5),
        action_moder_notes: dto.notes ?? null,
      },
    });

    const label = dto.decision === 'accepted' ? 'قبول' : dto.decision === 'refused' ? 'رفض' : 'انتظار';
    const userId = await this.resolveUserIdForEmployee(task.emp_name_id);
    if (userId) {
      await this.push.sendToUsers(
        [userId],
        `قرار مهمة — ${label}`,
        task.details ?? '',
        actorUserId,
      );
    }

    return { id, decision: dto.decision };
  }

  private async syncMokalfat(taskId: number, mokalfat?: TaskMokalfaDto[]) {
    const rows = (mokalfat ?? []).filter((m) => m.name?.trim());
    if (!rows.length) return;
    await this.prisma.hr_mosalat_mokalfat.createMany({
      data: rows.map((m) => ({
        mosala_id_fk: taskId,
        mokalfa_name: m.name.trim(),
        mokalfa_notes: m.notes?.trim() || null,
      })),
    });
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_mosalat.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المهمة غير موجودة');
    return row;
  }

  private async resolveUserIdForEmployee(empId: number | null | undefined): Promise<number | null> {
    if (!empId) return null;
    const emp = await this.prisma.employees.findUnique({
      where: { id: empId },
      select: { emp_code: true },
    });
    if (!emp?.emp_code) return null;
    const user = await this.prisma.users.findFirst({ where: { emp_code: emp.emp_code } });
    return user?.user_id ?? null;
  }
}
