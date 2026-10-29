import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun } from '../../common/preview/dry-run.util';
import { previewResponse } from '../../common/preview/preview.types';
import { assertValidWeekday } from '../../common/validators/validation.util';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ListWeeklyLeavesDto } from './dto/list-weekly-leaves.dto';
import { assertEmployeeInScope, scopedEmployeeIds } from '../reports/employee-branch-scope.util';

@Injectable()
export class WeeklyLeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async list(q: ListWeeklyLeavesDto, user: JwtUser) {
    const where: Prisma.hr_emp_agazat_dayesWhereInput = {};
    // Branch isolation: scoped users only see weekly leaves of employees in their branches.
    const empIds = await scopedEmployeeIds(this.prisma, this.branchScope, user);
    if (q.empId) {
      if (empIds !== null && !empIds.includes(Number(q.empId))) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.emp_id_fk = q.empId;
    } else if (empIds !== null) {
      where.emp_id_fk = { in: empIds };
    }
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
    user: JwtUser,
    dryRun = false,
  ) {
    const publisherId = user.sub;
    assertValidWeekday(body.offDay);
    const emp = await this.prisma.employees.findUnique({ where: { id: body.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    await assertEmployeeInScope(this.prisma, this.branchScope, user, emp.id);

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
    user: JwtUser,
    dryRun = false,
  ) {
    const publisherId = user.sub;
    const current = await this.findOrThrow(id, user);
    if (body.empId != null) await assertEmployeeInScope(this.prisma, this.branchScope, user, body.empId);
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

  async remove(id: number, user: JwtUser) {
    await this.findOrThrow(id, user);
    await this.prisma.hr_emp_agazat_dayes.delete({ where: { id } });
    return { id };
  }

  /** Load a weekly-leave row and enforce that its employee is inside the caller's branch scope. */
  private async findOrThrow(id: number, user: JwtUser) {
    const row = await this.prisma.hr_emp_agazat_dayes.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('إجازة الموظف الأسبوعية غير موجودة');
    await assertEmployeeInScope(this.prisma, this.branchScope, user, row.emp_id_fk);
    return row;
  }
}
