import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertDateOrder, assertNoOverlap } from '../../common/validators/validation.util';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ActionScreenService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto) {
    const where: Prisma.hr_egraat_emp_settingWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { person_name: { contains: s } },
        { job_title_n: { contains: s } },
        { person_code: { contains: s } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_egraat_emp_setting.findMany({ where, orderBy: { id: 'asc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_egraat_emp_setting.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.person_name ?? '',
      employeeName: r.job_title_n ?? '',
      createdAt: r.from_date ?? '',
      jobTitleCode: r.job_title_code_fk,
      personType: r.person_type,
      personCode: r.person_code,
      personSuspend: r.person_suspend,
      fromDate: r.from_date,
      toDate: r.to_date,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async listGrades() {
    const rows = await this.prisma.department_jobs.findMany({
      orderBy: [{ in_order: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, code: row.id, title: row.name }));
  }

  async create(
    body: {
      jobTitleCodeFk: number;
      personType: number;
      personCode: string;
      personName: string;
      personPrivateName?: string;
      personSuspend?: number;
      fromDate: string;
      toDate: string;
      branchIdFk?: number;
    },
    publisherId?: number,
    publisherName?: string | null,
  ) {
    const jobTitle = await this.prisma.department_jobs.findUnique({ where: { id: body.jobTitleCodeFk } });
    const emp = await this.prisma.employees.findFirst({ where: { emp_code: Number(body.personCode) } });
    await this.assertActionScope(
      {
        jobTitleCodeFk: body.jobTitleCodeFk,
        personCode: body.personCode,
        fromDate: body.fromDate,
        toDate: body.toDate,
      },
    );
    const now = new Date();
    const row = await this.prisma.hr_egraat_emp_setting.create({
      data: {
        job_title_code_fk: body.jobTitleCodeFk,
        job_title_id_fk: body.jobTitleCodeFk,
        job_title_n: jobTitle?.name ?? null,
        person_type: body.personType,
        person_code: body.personCode,
        person_name: body.personName,
        person_qsm: emp?.qsm_n ?? null,
        person_edara: emp?.edara_n ?? null,
        person_private_name: body.personPrivateName ?? null,
        person_suspend: body.personSuspend ?? 1,
        person_id: emp?.id ?? null,
        from_date: body.fromDate,
        to_date: body.toDate,
        from_date_str: String(Math.floor(new Date(body.fromDate).getTime() / 1000)),
        to_date_str: String(Math.floor(new Date(body.toDate).getTime() / 1000)),
        date: Math.floor(now.getTime() / 1000),
        date_ar: now.toISOString().slice(0, 10),
        publisher: publisherId,
        publisher_name: publisherName,
      },
    });
    return { id: row.id };
  }

  async update(
    id: number,
    body: {
      jobTitleCodeFk?: number;
      personType?: number;
      personCode?: string;
      personName?: string;
      personPrivateName?: string;
      personSuspend?: number;
      fromDate?: string;
      toDate?: string;
    },
    publisherId?: number,
    publisherName?: string | null,
  ) {
    const existing = await this.findOrThrow(id);
    const jobTitleCodeFk = body.jobTitleCodeFk ?? existing.job_title_code_fk;
    const personCode = body.personCode ?? existing.person_code ?? '';
    const fromDate = body.fromDate ?? existing.from_date ?? '';
    const toDate = body.toDate ?? existing.to_date ?? '';
    if (fromDate && toDate && jobTitleCodeFk != null) {
      await this.assertActionScope({ jobTitleCodeFk, personCode, fromDate, toDate }, id);
    }

    let jobTitleN: string | undefined;
    if (body.jobTitleCodeFk != null) {
      const jobTitle = await this.prisma.department_jobs.findUnique({ where: { id: body.jobTitleCodeFk } });
      jobTitleN = jobTitle?.name ?? undefined;
    }
    let empData: {
      person_qsm?: string | null;
      person_edara?: string | null;
      person_id?: number | null;
    } = {};
    if (body.personCode != null) {
      const emp = await this.prisma.employees.findFirst({ where: { emp_code: Number(body.personCode) } });
      empData = {
        person_qsm: emp?.qsm_n ?? null,
        person_edara: emp?.edara_n ?? null,
        person_id: emp?.id ?? null,
      };
    }
    const now = new Date();
    await this.prisma.hr_egraat_emp_setting.update({
      where: { id },
      data: {
        ...(body.jobTitleCodeFk != null
          ? { job_title_code_fk: body.jobTitleCodeFk, job_title_id_fk: body.jobTitleCodeFk, job_title_n: jobTitleN }
          : {}),
        ...(body.personType != null ? { person_type: body.personType } : {}),
        ...(body.personCode != null ? { person_code: body.personCode } : {}),
        ...(body.personName != null ? { person_name: body.personName } : {}),
        ...(body.personPrivateName != null ? { person_private_name: body.personPrivateName } : {}),
        ...(body.personSuspend != null ? { person_suspend: body.personSuspend } : {}),
        ...(body.fromDate != null
          ? { from_date: body.fromDate, from_date_str: String(Math.floor(new Date(body.fromDate).getTime() / 1000)) }
          : {}),
        ...(body.toDate != null
          ? { to_date: body.toDate, to_date_str: String(Math.floor(new Date(body.toDate).getTime() / 1000)) }
          : {}),
        ...empData,
        date: Math.floor(now.getTime() / 1000),
        date_ar: now.toISOString().slice(0, 10),
        ...(publisherId != null ? { publisher: publisherId } : {}),
        ...(publisherName != null ? { publisher_name: publisherName } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_egraat_emp_setting.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_egraat_emp_setting.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('إعداد الإجراء غير موجود');
    return row;
  }

  private async assertActionScope(
    scope: { jobTitleCodeFk: number; personCode: string; fromDate: string; toDate: string },
    excludeId?: number,
  ) {
    assertDateOrder(scope.fromDate, scope.toDate, 'تاريخ نهاية الصلاحية يجب أن يكون بعد البداية');
    const existing = await this.prisma.hr_egraat_emp_setting.findMany({
      where: {
        job_title_code_fk: scope.jobTitleCodeFk,
        person_code: scope.personCode,
        ...(excludeId != null ? { id: { not: excludeId } } : {}),
      },
    });
    assertNoOverlap(
      { start: scope.fromDate, end: scope.toDate, label: 'الفترة الجديدة' },
      existing.map((r) => ({
        start: r.from_date ?? scope.fromDate,
        end: r.to_date ?? scope.toDate,
        id: r.id,
        label: r.from_date ?? undefined,
      })),
      'يوجد تداخل في نطاق صلاحية الإجراء',
    );
  }
}
