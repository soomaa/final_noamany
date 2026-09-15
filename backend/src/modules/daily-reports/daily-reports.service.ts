import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateDailyReportDto,
  ListDailyReportsDto,
  RejectDailyReportDto,
  UpdateDailyReportDto,
} from './dto/daily-reports.dto';

@Injectable()
export class DailyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListDailyReportsDto) {
    const and: Prisma.hr_dialy_reportsWhereInput[] = [];

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ title: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.status === 'inprogress' || q.status === 'done') {
      and.push({ status: q.status });
    }
    // type → for_month, date → for_year (numeric filters, see ListDailyReportsDto)
    const month = q.type ? parseInt(q.type, 10) : NaN;
    if (!Number.isNaN(month)) and.push({ for_month: month });
    const year = q.date ? parseInt(q.date, 10) : NaN;
    if (!Number.isNaN(year)) and.push({ for_year: year });

    const where: Prisma.hr_dialy_reportsWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_dialy_reports.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_dialy_reports.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const emp = row.emp_id_fk
          ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk } })
          : null;
        return {
          id: row.id,
          employeeName: emp?.employee ?? '',
          empId: row.emp_id_fk,
          title: row.title,
          status: row.status,
          notes: row.notes,
          forMonth: row.for_month,
          forYear: row.for_year,
          suspend: row.suspend,
          radNotes: row.rad_notes,
          sendDate: row.send_date_ar,
          sendTime: row.send_time,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk } })
      : null;
    return {
      id: row.id,
      employeeName: emp?.employee ?? '',
      empId: row.emp_id_fk,
      title: row.title,
      status: row.status,
      notes: row.notes,
      forMonth: row.for_month,
      forYear: row.for_year,
      suspend: row.suspend,
      radNotes: row.rad_notes,
      sendDate: row.send_date_ar,
      sendTime: row.send_time,
    };
  }

  async create(dto: CreateDailyReportDto) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    // legacy stamps send_date_ar / send_time at insert time.
    const now = new Date();
    const sendDate = now.toISOString().slice(0, 10);
    const sendTime = now.toTimeString().slice(0, 5);

    // Derive the report period from the submit date so it can never contradict it;
    // an explicit forMonth/forYear (rare back-fill) still wins when provided.
    const derivedMonth = now.getMonth() + 1;
    const derivedYear = now.getFullYear();

    const row = await this.prisma.hr_dialy_reports.create({
      data: {
        emp_id_fk: dto.empId,
        title: dto.title,
        notes: dto.notes ?? null,
        status: dto.status ?? 'inprogress',
        for_month: dto.forMonth ?? derivedMonth,
        for_year: dto.forYear ?? derivedYear,
        send_date_ar: sendDate,
        send_time: sendTime,
        suspend: SuspendStatus.INCOMING,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateDailyReportDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_dialy_reports.update({
      where: { id },
      data: {
        ...(dto.empId != null ? { emp_id_fk: dto.empId } : {}),
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.notes != null ? { notes: dto.notes } : {}),
        ...(dto.status != null ? { status: dto.status } : {}),
        ...(dto.forMonth != null ? { for_month: dto.forMonth } : {}),
        ...(dto.forYear != null ? { for_year: dto.forYear } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_dialy_reports.delete({ where: { id } });
    return { id };
  }

  /** Approve a report: suspend → 4 and clear any prior rejection note. */
  async approve(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_dialy_reports.update({
      where: { id },
      data: { suspend: SuspendStatus.APPROVED, rad_notes: null },
    });
    return { id, suspend: SuspendStatus.APPROVED };
  }

  /** Reject a report: suspend → 2 and store the reviewer note in rad_notes. */
  async reject(id: number, dto: RejectDailyReportDto) {
    await this.findOrThrow(id);
    await this.prisma.hr_dialy_reports.update({
      where: { id },
      data: { suspend: SuspendStatus.REJECTED, rad_notes: dto.radNotes ?? null },
    });
    return { id, suspend: SuspendStatus.REJECTED };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_dialy_reports.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التقرير اليومي غير موجود');
    return row;
  }
}
