import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { SuspendStatus } from '../../common/utils/suspend-status.util';
import {
  CreateInitiativeDto,
  ListInitiativesDto,
  RejectInitiativeDto,
  UpdateInitiativeDto,
} from './dto/initiatives.dto';

function suspendToStatus(suspend: number | null): 'approved' | 'rejected' | 'pending' {
  if (suspend === SuspendStatus.APPROVED) return 'approved';
  if (suspend === SuspendStatus.REJECTED) return 'rejected';
  return 'pending';
}

@Injectable()
export class InitiativesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListInitiativesDto) {
    const and: Prisma.hr_mobadratWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ title: { contains: s } }, { notes: { contains: s } }] });
    }

    const where: Prisma.hr_mobadratWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_mobadrat.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_mobadrat.count({ where }),
    ]);

    const empIds = [...new Set(rows.map((r) => r.emp_id_fk).filter((v): v is number => v != null))];
    const employees = empIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: empIds } },
          select: { id: true, employee: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e.employee]));

    const data = rows.map((row) => ({
      id: row.id,
      employeeName: row.emp_id_fk != null ? empMap.get(row.emp_id_fk) ?? '' : '',
      empId: row.emp_id_fk,
      title: row.title,
      notes: row.notes,
      forMonth: row.for_month,
      forYear: row.for_year,
      date: row.send_date_ar,
      status: suspendToStatus(row.suspend),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    const emp =
      row.emp_id_fk != null
        ? await this.prisma.employees.findUnique({
            where: { id: row.emp_id_fk },
            select: { id: true, employee: true },
          })
        : null;
    return {
      id: row.id,
      employeeName: emp?.employee ?? '',
      empId: row.emp_id_fk,
      title: row.title,
      notes: row.notes,
      forMonth: row.for_month,
      forYear: row.for_year,
      date: row.send_date_ar,
      time: row.send_time,
      radNotes: row.rad_notes,
      status: suspendToStatus(row.suspend),
    };
  }

  async create(dto: CreateInitiativeDto) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const now = new Date();
    const row = await this.prisma.hr_mobadrat.create({
      data: {
        emp_id_fk: dto.empId,
        title: dto.title,
        notes: dto.notes ?? null,
        for_month: dto.forMonth ?? null,
        for_year: dto.forYear ?? null,
        send_date_ar: todayIso(),
        send_time: now.toTimeString().slice(0, 5),
        suspend: SuspendStatus.INCOMING,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateInitiativeDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_mobadrat.update({
      where: { id },
      data: {
        ...(dto.empId != null ? { emp_id_fk: dto.empId } : {}),
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.notes != null ? { notes: dto.notes } : {}),
        ...(dto.forMonth != null ? { for_month: dto.forMonth } : {}),
        ...(dto.forYear != null ? { for_year: dto.forYear } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_mobadrat.delete({ where: { id } });
    return { id };
  }

  /** Approve an initiative (suspend → 4). */
  async approve(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_mobadrat.update({ where: { id }, data: { suspend: SuspendStatus.APPROVED } });
    return { id, status: suspendToStatus(SuspendStatus.APPROVED) };
  }

  /** Reject an initiative (suspend → 2) and store the reason in rad_notes. */
  async reject(id: number, dto: RejectInitiativeDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_mobadrat.update({
      where: { id },
      data: { suspend: SuspendStatus.REJECTED, rad_notes: dto.radNotes ?? null },
    });
    return { id, status: suspendToStatus(SuspendStatus.REJECTED) };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_mobadrat.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المبادرة غير موجودة');
    return row;
  }
}
