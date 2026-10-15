import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmployeeType } from '../../common/constants/hr-codes';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { PushService } from '../push/push.service';
import { CreateCircularDto, ListCircularsDto } from './dto/circular.dto';

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class CircularsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(q: ListCircularsDto) {
    const and: Prisma.hr_ta3memWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ ta3mem_title: { contains: s } }, { subject: { contains: s } }],
      });
    }

    const where: Prisma.hr_ta3memWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_ta3mem.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_ta3mem.count({ where }),
    ]);

    const counts = await Promise.all(
      rows.map((r) => this.prisma.hr_ta3mem_details.count({ where: { ta3mem_id_fk: r.id } })),
    );

    const data = rows.map((row, i) => ({
      id: row.id,
      title: row.ta3mem_title,
      employeeName: stripHtml(row.subject),
      createdAt: row.ta3mem_date,
      recipientCount: counts[i],
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async getOne(id: number) {
    const row = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التعميم غير موجود');
    const details = await this.prisma.hr_ta3mem_details.findMany({
      where: { ta3mem_id_fk: id },
      orderBy: { id: 'asc' },
    });
    return {
      id: row.id,
      title: row.ta3mem_title,
      subject: row.subject,
      date: row.ta3mem_date,
      type: row.type,
      details: details.map((d) => ({
        id: d.id,
        empId: d.emp_id,
        empCode: d.emp_code,
        empName: d.emp_name,
        seen: d.seen,
        seenDate: d.seen_date,
        seenTime: d.seen_time,
      })),
    };
  }

  /**
   * Top-level edarat (departments) available as circular targets.
   * Mirrors Ta3mem_model::get_all_edarat / Ta3mem_c::getConnection_emp
   * (hr_edarat_aqsam where from_id_fk = 0).
   */
  async listDepartmentRecipients() {
    const rows = await this.prisma.hr_edarat_aqsam.findMany({
      where: { from_id_fk: 0 },
      orderBy: { trteeb: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, title: r.title }));
  }

  async create(dto: CreateCircularDto, publisherId?: number) {
    const dateStr = dto.date ?? todayIso();
    const row = await this.prisma.hr_ta3mem.create({
      data: {
        ta3mem_title: dto.title,
        subject: dto.subject,
        ta3mem_date: dateStr,
        type: 't3mem',
        date: Math.floor(new Date(dateStr).getTime() / 1000),
        date_ar: Math.floor(new Date(dateStr).getTime() / 1000),
        publisher: publisherId,
      },
    });

    // Resolve the targeted employee set (legacy load_tahwel routing).
    const empIds = await this.resolveRecipientEmpIds(dto);
    if (empIds.length) {
      await this.insertRecipients(row.id, empIds);
      const userIds = await this.resolveUserIdsForEmployees(empIds);
      if (userIds.length) {
        await this.push.sendToUsers(
          userIds,
          dto.title,
          stripHtml(dto.subject) || 'تعميم جديد',
          publisherId,
        );
      }
    }

    return { id: row.id };
  }

  /**
   * Expand the circular's targeting into a de-duplicated list of employee ids.
   *  - recipientType 1: all active (employee_type=1) employees whose
   *    edara_id OR qsm_id falls under one of the targeted edarat.
   *  - recipientType 2 (default): the explicit empIds.
   */
  private async resolveRecipientEmpIds(dto: CreateCircularDto): Promise<number[]> {
    const ids = new Set<number>();

    if (dto.recipientType === 1) {
      const edaraIds = dto.edaraIds ?? [];
      if (edaraIds.length) {
        const emps = await this.prisma.employees.findMany({
          where: {
            employee_type: EmployeeType.ACTIVE,
            OR: [{ edara_id: { in: edaraIds } }, { qsm_id: { in: edaraIds } }],
          },
          select: { id: true },
        });
        for (const e of emps) ids.add(e.id);
      }
    }

    // Always honour explicitly-listed employees too (additive, like the legacy form).
    for (const id of dto.empIds ?? []) ids.add(id);

    return [...ids];
  }

  async markSeen(id: number, empId: number | null) {
    const circular = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
    if (!circular) throw new NotFoundException('التعميم غير موجود');
    if (!empId) throw new NotFoundException('المستخدم غير مرتبط بموظف');

    const detail = await this.prisma.hr_ta3mem_details.findFirst({
      where: { ta3mem_id_fk: id, emp_id: empId },
    });
    if (!detail) throw new NotFoundException('التعميم غير موجه لهذا الموظف');

    const dateStr = todayIso();
    await this.prisma.hr_ta3mem_details.update({
      where: { id: detail.id },
      data: {
        seen: 1,
        seen_date: dateStr,
        seen_time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      },
    });
    return { id, seen: true };
  }

  async remove(id: number) {
    await this.getOne(id);
    await this.prisma.hr_ta3mem_details.deleteMany({ where: { ta3mem_id_fk: id } });
    await this.prisma.hr_ta3mem.delete({ where: { id } });
    return { id };
  }

  private async insertRecipients(ta3memId: number, empIds: number[]) {
    for (const empId of empIds) {
      const emp = await this.prisma.employees.findUnique({ where: { id: empId } });
      if (!emp) continue;
      await this.prisma.hr_ta3mem_details.create({
        data: {
          ta3mem_id_fk: ta3memId,
          emp_id: emp.id,
          emp_code: emp.emp_code,
          emp_name: emp.employee,
        },
      });
    }
  }

  private async resolveUserIdsForEmployees(empIds: number[]): Promise<number[]> {
    const emps = await this.prisma.employees.findMany({
      where: { id: { in: empIds } },
      select: { emp_code: true },
    });
    const codes = emps.map((e) => e.emp_code).filter((c): c is number => c != null);
    if (!codes.length) return [];
    const users = await this.prisma.users.findMany({
      where: { emp_code: { in: codes } },
      select: { user_id: true },
    });
    return users.map((u) => u.user_id);
  }
}
