import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BranchesService } from '../branches/branches.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Cafe-safe aliases for POS lookup routes that the gym SPA expects
 * (/club/branch-options, /employees/pos-options) but which Ordera's slim
 * AppModule does not register (no GymOps / Employees modules).
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class PosCompatController {
  constructor(
    private readonly branches: BranchesService,
    private readonly branchScope: BranchScopeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('club/branch-options')
  @RequiresPermission(
    'org.branches:view',
    'gym-sales.sales.new_receipt:view',
    'gym-sales.sales.drafts:view',
    'gym-sales.sales.shifts:view',
    'gym-sales.sales.treasury:view',
    'gym-sales.sales.settlements:view',
    'gym-sales.inventory.dashboard:view',
    'gym-sales.inventory.raw_materials:view',
    'gym-sales.procurement.cafe_purchases:view',
  )
  async branchOptions(@CurrentUser() user: JwtUser) {
    const all = await this.branches.findAll();
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null ? all : all.filter((b) => allowed.includes(b.id));
  }

  @Get('employees/pos-options')
  @RequiresPermission(
    'gym-sales.sales.new_receipt:view',
    'gym-sales.sales.treasury:view',
    'gym-sales.sales.settlements:view',
  )
  posEmployeeOptions() {
    return this.listPosEmployees();
  }

  /** Preferred cafe path (also used as frontend fallback). */
  @Get('pos/employee-options')
  @RequiresPermission(
    'gym-sales.sales.new_receipt:view',
    'gym-sales.sales.treasury:view',
    'gym-sales.sales.settlements:view',
  )
  posEmployeeOptionsAlias() {
    return this.listPosEmployees();
  }

  private async listPosEmployees() {
    try {
      const rows = await this.prisma.employees.findMany({
        where: {
          employee_type: 1,
          OR: [{ leave_emp: null }, { leave_emp: 0 }],
        },
        select: { id: true, employee: true, emp_code: true },
        orderBy: [{ employee: 'asc' }, { emp_code: 'asc' }],
      });
      if (rows.length > 0) return rows;
    } catch {
      /* employees table may be empty / unused in cafe */
    }

    const users = await this.prisma.users.findMany({
      where: {
        approved: 1,
        NOT: { username: { startsWith: '_retired_' } },
      },
      select: { user_id: true, name: true, username: true },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({
      id: u.user_id,
      employee: u.name?.trim() || u.username || null,
      emp_code: null as number | null,
    }));
  }
}
