import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertExists } from '../../common/validators/validation.util';
import { diffDaysFromToday, toIsoDate } from '../../common/utils/legacy-date.util';

const DOC_TYPE_LABELS: Record<number, string> = {
  1: 'هوية',
  2: 'جواز',
  3: 'رخصة',
  4: 'عقد',
  5: 'شهادة',
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto & { expiry?: string }) {
    const and: Prisma.emp_filesWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { title: { contains: s } },
          { employee: { employee: { contains: s } } },
          { emp_code: { contains: s } },
        ],
      });
    }

    const rows = await this.prisma.emp_files.findMany({
      where: and.length ? { AND: and } : undefined,
      include: { employee: { select: { employee: true } } },
      orderBy: { id: 'desc' },
    });

    let mapped = rows.map((r) => this.toRow(r));

    if (q.expiry) {
      mapped = mapped.filter((r) => {
        const days = diffDaysFromToday(r.expiryDate);
        if (days == null) return q.expiry === 'valid';
        if (q.expiry === 'expired') return days < 0;
        if (q.expiry === 'expiring') return days >= 0 && days <= 30;
        if (q.expiry === 'valid') return days > 30;
        return true;
      });
    }

    const total = mapped.length;
    const page = mapped.slice(q.skip, q.skip + q.take);
    return paginated(page, total, q.page, q.pageSize);
  }

  async expiring(days = 30) {
    const rows = await this.prisma.emp_files.findMany({
      where: { have_date: 1, to_date: { not: null } },
      include: { employee: { select: { employee: true } } },
      orderBy: { to_date: 'asc' },
    });
    return rows
      .map((r) => this.toRow(r))
      .filter((r) => {
        const d = diffDaysFromToday(r.expiryDate);
        return d != null && d >= 0 && d <= days;
      });
  }

  async create(dto: {
    empId: number;
    title: string;
    filePath?: string;
    docType?: number;
    expiryDate?: string;
  }) {
    const emp = await assertExists(
      () => this.prisma.employees.findUnique({ where: { id: dto.empId }, select: { id: true, emp_code: true } }),
      'الموظف غير موجود',
    );
    const row = await this.prisma.emp_files.create({
      data: {
        emp_id: emp.id,
        emp_code: emp.emp_code != null ? String(emp.emp_code) : '0',
        title: dto.title,
        emp_file: dto.filePath ?? '',
        period: dto.docType ?? null,
        have_date: dto.expiryDate ? 1 : 0,
        to_date: dto.expiryDate ?? null,
      },
    });
    return { id: row.id };
  }

  async remove(id: number) {
    const row = await this.prisma.emp_files.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المستند غير موجود');
    await this.prisma.emp_files.delete({ where: { id } });
    return { id };
  }

  private toRow(r: {
    id: number;
    title: string;
    period: number | null;
    to_date: string | null;
    to_date_h: string | null;
    employee: { employee: string | null } | null;
  }) {
    const expiryDate = toIsoDate(r.to_date ?? r.to_date_h);
    const days = diffDaysFromToday(expiryDate);
    let status = 'active';
    if (days != null) {
      if (days < 0) status = 'expired';
      else if (days <= 30) status = 'expiring';
    }
    return {
      id: r.id,
      employeeName: r.employee?.employee ?? undefined,
      title: r.title,
      docType: r.period != null ? (DOC_TYPE_LABELS[r.period] ?? String(r.period)) : undefined,
      expiryDate,
      status,
    };
  }
}
