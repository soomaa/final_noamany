import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { salesSpecialistEmployeeWhere, salesSpecialistJobTitleWhere } from './one80-sales-specialist.util';

@UseGuards(JwtAuthGuard)
@Controller('employees')
export class One80EmployeeOptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sales-reps')
  @RequiresPermission('club.members:view', 'club.members:create')
  async salesReps() {
    const jobs = await this.prisma.department_jobs.findMany({ where: salesSpecialistJobTitleWhere, select: { id: true } });
    const rows = await this.prisma.employees.findMany({
      where: { AND: [{ OR: [{ leave_emp: null }, { leave_emp: 0 }] }, { employee_type: 1 }, salesSpecialistEmployeeWhere(jobs.map((job) => job.id))] },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true },
      orderBy: { employee: 'asc' },
    });
    const ids = rows.map((row) => row.id);
    const [settings, assignments] = ids.length ? await Promise.all([
      this.prisma.club_sales_rep_settings.findMany({ where: { employee_id: { in: ids } }, select: { employee_id: true, is_active: true } }),
      this.prisma.club_sales_rep_branches.findMany({ where: { employee_id: { in: ids } }, select: { employee_id: true, branch_id: true } }),
    ]) : [[], []];
    const activeById = new Map(settings.map((row) => [row.employee_id, row.is_active]));
    return rows.filter((row) => activeById.get(row.id) !== false).map((row) => {
      const branchIds = assignments.filter((item) => item.employee_id === row.id).map((item) => item.branch_id);
      return { id: row.id, name: row.employee, empCode: row.emp_code, branchId: row.branch_id_fk, branchIds: branchIds.length ? branchIds : row.branch_id_fk == null ? [] : [row.branch_id_fk] };
    });
  }

  @Get('pos-options')
  @RequiresPermission('gym-sales.sales.new_receipt:view', 'gym-sales.sales.treasury:view', 'gym-sales.sales.settlements:view', 'gym-sales.sales.drafts:update')
  posOptions() {
    return this.prisma.employees.findMany({
      where: { employee_type: 1, OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      select: { id: true, employee: true, emp_code: true },
      orderBy: [{ employee: 'asc' }, { emp_code: 'asc' }],
    });
  }
}
