import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun } from '../../common/preview/dry-run.util';
import { previewResponse } from '../../common/preview/preview.types';
import { assertValidWeekday } from '../../common/validators/validation.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListWeeklyLeavesDto } from './dto/list-weekly-leaves.dto';

@Injectable()
export class WeeklyLeavesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListWeeklyLeavesDto) {
    const where: Prisma.hr_emp_agazat_dayesWhereInput = {};
    if (q.empId) where.emp_id_fk = q.empId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ emp_name: { contains: s } }, { off_day: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_emp_agazat_dayes.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_emp_agazat_dayes.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.off_day,
      employeeName: r.emp_name,
      createdAt: r.date_ar,
      empId: r.emp_id_fk,
      empCode: r.emp_code_fk,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async create(
    body: { empId: number; offDay: string },
    publisherId?: number,
    dryRun = false,
  ) {
    assertValidWeekday(body.offDay);
    const emp = await this.prisma.employees.findUnique({ where: { id: body.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const existing = await this.prisma.hr_emp_agazat_dayes.findMany({
      where: { emp_id_fk: body.empId },
    });

    if (isDryRun(dryRun)) {
      return previewResponse(
        { empId: body.empId, offDay: body.offDay },
        {
          rows: [
            ...(existing.length
              ? existing.map((r) => ({
                  label: 'سيتم حذف',
                  before: `${r.off_day} (${r.emp_name})`,
                }))
              : [{ label: 'الحالي', before: 'لا يوجد' }]),
            {
              label: 'سيتم إضافة',
              after: `${body.offDay} (${emp.employee ?? ''})`,
            },
          ],
          warning:
            existing.length > 0
              ? 'إضافة يوم راحة جديد سيستبدل أيام الراحة السابقة لهذا الموظف'
              : undefined,
        },
      );
    }

    await this.prisma.hr_emp_agazat_dayes.deleteMany({ where: { emp_id_fk: body.empId } });

    const row = await this.prisma.hr_emp_agazat_dayes.create({
      data: {
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code ?? 0,
        emp_name: emp.employee ?? '',
        off_day: body.offDay,
        date_ar: new Date().toISOString().slice(0, 10),
        publisher: publisherId ?? 0,
      },
    });
    return { id: row.id };
  }

  async update(
    id: number,
    body: { empId?: number; offDay?: string },
    publisherId?: number,
    dryRun = false,
  ) {
    const current = await this.findOrThrow(id);
    if (body.offDay != null) assertValidWeekday(body.offDay);

    if (isDryRun(dryRun)) {
      return previewResponse(
        { id, ...body },
        {
          rows: [
            { label: 'قبل', before: current.off_day ?? '—' },
            { label: 'بعد', after: body.offDay ?? current.off_day ?? '—' },
          ],
        },
      );
    }

    let empData: { emp_id_fk?: number; emp_code_fk?: number; emp_name?: string } = {};
    if (body.empId != null) {
      const emp = await this.prisma.employees.findUnique({ where: { id: body.empId } });
      if (!emp) throw new NotFoundException('الموظف غير موجود');
      empData = {
        emp_id_fk: emp.id,
        emp_code_fk: emp.emp_code ?? undefined,
        emp_name: emp.employee ?? undefined,
      };
    }
    await this.prisma.hr_emp_agazat_dayes.update({
      where: { id },
      data: {
        ...empData,
        ...(body.offDay != null ? { off_day: body.offDay } : {}),
        date_ar: new Date().toISOString().slice(0, 10),
        ...(publisherId != null ? { publisher: publisherId } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_emp_agazat_dayes.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_emp_agazat_dayes.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('إجازة الموظف الأسبوعية غير موجودة');
    return row;
  }
}
