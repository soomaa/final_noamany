import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertExists } from '../../common/validators/validation.util';
import { diffDaysFromToday, toIsoDate } from '../../common/utils/legacy-date.util';
import { todayIso } from '../../common/utils/legacy-date.util';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { addDateOnlyDays } from '../../common/utils/cairo-date';
import { claimEmployeePrivateFile } from '../uploads/private-file-reference.util';

const DOC_TYPE_LABELS: Record<number, string> = {
  1: 'هوية',
  2: 'جواز',
  3: 'رخصة',
  4: 'عقد',
  5: 'شهادة',
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrDataScopeService,
  ) {}

  async list(q: PaginationDto & { expiry?: string }, user: JwtUser) {
    const and: Prisma.emp_filesWhereInput[] = [];
    and.push({ employee: await this.scope.employeeWhere(user, 'employees.documents') });
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

    if (q.expiry) {
      const today = todayIso();
      const cutoff = addDateOnlyDays(today, 30);
      if (q.expiry === 'expired') and.push({ have_date: 1, to_date: { lt: today } });
      if (q.expiry === 'expiring') and.push({ have_date: 1, to_date: { gte: today, lte: cutoff } });
      if (q.expiry === 'valid') and.push({ OR: [{ have_date: { not: 1 } }, { to_date: null }, { to_date: { gt: cutoff } }] });
    }

    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.emp_files.findMany({
        where,
        include: { employee: { select: { employee: true } } },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.emp_files.count({ where }),
    ]);
    return paginated(rows.map((row) => this.toRow(row)), total, q.page, q.pageSize);
  }

  async expiring(days = 30, user: JwtUser) {
    const boundedDays = Math.min(Math.max(Number.isFinite(days) ? days : 30, 0), 3650);
    const today = todayIso();
    const rows = await this.prisma.emp_files.findMany({
      where: { AND: [
        { employee: await this.scope.employeeWhere(user, 'employees.documents') },
        { have_date: 1, to_date: { gte: today, lte: addDateOnlyDays(today, boundedDays) } },
      ] },
      include: { employee: { select: { employee: true } } },
      orderBy: { to_date: 'asc' },
      take: 200,
    });
    return rows.map((row) => this.toRow(row));
  }

  async create(dto: {
    empId: number;
    title: string;
    filePath?: string;
    docType?: number;
    expiryDate?: string;
  }, user: JwtUser) {
    const employeeWhere = await this.scope.employeeWhere(user, 'employees.documents');
    const emp = await assertExists(
      () => this.prisma.employees.findFirst({ where: { AND: [{ id: dto.empId }, employeeWhere] }, select: { id: true, emp_code: true } }),
      'الموظف غير موجود',
    );
    const row = await this.prisma.$transaction(async (tx) => {
      await claimEmployeePrivateFile(tx, dto.filePath, emp.id, user.sub, ['document']);
      return tx.emp_files.create({
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
    });
    return { id: row.id };
  }

  async remove(id: number, user: JwtUser) {
    const row = await this.prisma.emp_files.findFirst({
      where: { id, employee: await this.scope.employeeWhere(user, 'employees.documents') },
    });
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
