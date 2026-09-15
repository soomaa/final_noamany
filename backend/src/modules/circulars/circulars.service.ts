import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmployeeType } from '../../common/constants/hr-codes';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { PushService } from '../push/push.service';
import { CreateCircularDto, ListCircularsDto, UpdateCircularDto } from './dto/circular.dto';

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class CircularsService {
  private readonly logger = new Logger(CircularsService.name);

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
      rows.map(async (r) => ({
        total: await this.prisma.hr_ta3mem_details.count({ where: { ta3mem_id_fk: r.id } }),
        read: await this.prisma.hr_ta3mem_details.count({ where: { ta3mem_id_fk: r.id, seen: 1 } }),
      })),
    );

    const data = rows.map((row, i) => ({
      id: row.id,
      title: row.ta3mem_title,
      subject: stripHtml(row.subject),
      createdAt: row.ta3mem_date,
      image: row.img,
      recipientCount: counts[i].total,
      readCount: counts[i].read,
      published: row.send_all_t3mem === 1,
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
    const attachments = await this.prisma.hr_ta3mem_attaches.findMany({
      where: { ta3mem_id_fk: id },
      orderBy: { id: 'asc' },
    });
    return {
      id: row.id,
      title: row.ta3mem_title,
      subject: row.subject,
      date: row.ta3mem_date,
      image: row.img,
      type: row.type,
      published: row.send_all_t3mem === 1,
      details: details.map((d) => ({
        id: d.id,
        empId: d.emp_id,
        empCode: d.emp_code,
        empName: d.emp_name,
        seen: d.seen,
        seenDate: d.seen_date,
        seenTime: d.seen_time,
      })),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        title: attachment.title,
        file: attachment.file,
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

  async create(dto: CreateCircularDto, publisherId?: number, publisherName?: string | null) {
    const dateStr = dto.date ?? todayIso();
    const empIds = await this.resolveRecipientEmpIds(dto);
    if (!empIds.length) {
      throw new BadRequestException('يجب اختيار موظف أو إدارة واحدة على الأقل، أو اختيار جميع الموظفين');
    }
    const row = await this.prisma.hr_ta3mem.create({
      data: {
        ta3mem_title: dto.title,
        subject: dto.subject,
        ta3mem_date: dateStr,
        type: 't3mem',
        date: Math.floor(new Date(dateStr).getTime() / 1000),
        date_ar: Math.floor(new Date(dateStr).getTime() / 1000),
        publisher: publisherId,
        img: dto.image,
        send_all_t3mem: 1,
      },
    });

    // Resolve the targeted employee set (legacy load_tahwel routing).
    {
      await this.insertRecipients(row.id, empIds);
      const userIds = await this.resolveUserIdsForEmployees(empIds);
      if (userIds.length) {
        // Notification delivery must never make the admin save operation fail.
        // The circular and its recipients have already been persisted.
        try {
          await this.push.sendToUsers(
            userIds,
            dto.title,
            stripHtml(dto.subject) || 'تعميم جديد',
            publisherId,
          );
        } catch (error) {
          this.logger.error('Circular saved but its push notifications could not be sent', error);
        }
      }
    }

    for (const attachment of dto.attachments ?? []) {
      await this.prisma.hr_ta3mem_attaches.create({
        data: {
          ta3mem_id_fk: row.id,
          title: attachment.title,
          file: attachment.file,
          date: dateStr,
          date_ar: dateStr,
          publisher: publisherId,
          publisher_name: publisherName,
        },
      });
    }

    return { id: row.id };
  }

  async update(
    id: number,
    dto: UpdateCircularDto,
    publisherId?: number,
    publisherName?: string | null,
  ) {
    const existing = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التعميم غير موجود');

    const recipientsChanged = dto.sendToAll != null || dto.recipientType != null
      || dto.empIds != null || dto.edaraIds != null;
    const empIds = recipientsChanged ? await this.resolveRecipientEmpIds(dto) : [];
    if (recipientsChanged && !empIds.length) {
      throw new BadRequestException('يجب اختيار موظف أو إدارة واحدة على الأقل، أو اختيار جميع الموظفين');
    }

    const dateStr = dto.date ?? existing.ta3mem_date ?? todayIso();
    await this.prisma.hr_ta3mem.update({
      where: { id },
      data: {
        ...(dto.title != null ? { ta3mem_title: dto.title } : {}),
        ...(dto.subject != null ? { subject: dto.subject } : {}),
        ...(dto.date != null ? {
          ta3mem_date: dateStr,
          date: Math.floor(new Date(dateStr).getTime() / 1000),
          date_ar: Math.floor(new Date(dateStr).getTime() / 1000),
        } : {}),
        ...(dto.image != null ? { img: dto.image } : {}),
        publisher: publisherId,
        send_all_t3mem: 1,
      },
    });

    if (recipientsChanged) {
      await this.prisma.hr_ta3mem_details.deleteMany({ where: { ta3mem_id_fk: id } });
      await this.insertRecipients(id, empIds);
    }
    if (dto.attachments != null) {
      await this.prisma.hr_ta3mem_attaches.deleteMany({ where: { ta3mem_id_fk: id } });
      for (const attachment of dto.attachments) {
        await this.prisma.hr_ta3mem_attaches.create({
          data: {
            ta3mem_id_fk: id,
            title: attachment.title,
            file: attachment.file,
            date: dateStr,
            date_ar: dateStr,
            publisher: publisherId,
            publisher_name: publisherName,
          },
        });
      }
    }
    return { id };
  }

  /**
   * Expand the circular's targeting into a de-duplicated list of employee ids.
   *  - recipientType 1: all active (employee_type=1) employees whose
   *    edara_id OR qsm_id falls under one of the targeted edarat.
   *  - recipientType 2 (default): the explicit empIds.
   */
  private async resolveRecipientEmpIds(dto: Pick<CreateCircularDto,
    'sendToAll' | 'recipientType' | 'empIds' | 'edaraIds'>): Promise<number[]> {
    const ids = new Set<number>();

    if (dto.sendToAll) {
      const emps = await this.prisma.employees.findMany({
        where: { employee_type: EmployeeType.ACTIVE },
        select: { id: true },
      });
      for (const e of emps) ids.add(e.id);
    }

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

  async markSeen(id: number, employeeId: number | null) {
    const circular = await this.prisma.hr_ta3mem.findUnique({ where: { id } });
    if (!circular) throw new NotFoundException('التعميم غير موجود');
    if (!employeeId) throw new NotFoundException('المستخدم غير مرتبط بموظف');
    const employee = await this.prisma.employees.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');

    const detail = await this.prisma.hr_ta3mem_details.findFirst({
      where: { ta3mem_id_fk: id, emp_id: employee.id },
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
    await this.prisma.hr_ta3mem_attaches.deleteMany({ where: { ta3mem_id_fk: id } });
    await this.prisma.hr_ta3mem_details.deleteMany({ where: { ta3mem_id_fk: id } });
    await this.prisma.hr_ta3mem.delete({ where: { id } });
    return { id };
  }

  private async insertRecipients(ta3memId: number, empIds: number[]) {
    const employees = await this.prisma.employees.findMany({
      where: { id: { in: empIds } },
      select: { id: true, emp_code: true, employee: true },
    });
    if (!employees.length) return;

    await this.prisma.hr_ta3mem_details.createMany({
      data: employees.map((employee) => ({
        ta3mem_id_fk: ta3memId,
        emp_id: employee.id,
        emp_code: employee.emp_code,
        // The legacy recipient column is VARCHAR(100), while employee names
        // are VARCHAR(200). Never let one long name abort a broadcast save.
        emp_name: employee.employee?.slice(0, 100) ?? null,
      })),
    });
  }

  private async resolveUserIdsForEmployees(empIds: number[]): Promise<number[]> {
    const users = await this.prisma.users.findMany({
      // users.emp_code stores employees.id in the legacy schema.
      where: { emp_code: { in: empIds } },
      select: { user_id: true },
    });
    return users.map((u) => u.user_id);
  }
}
