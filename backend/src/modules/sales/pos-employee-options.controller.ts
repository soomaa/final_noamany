import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('pos/employee-options')
export class PosEmployeeOptionsController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @RequiresPermission('gym-sales.sales.new_receipt:view', 'gym-sales.sales.treasury:view', 'gym-sales.sales.settlements:view')
  list() {
    return this.prisma.employees.findMany({
      where: { employee_type: 1, OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      select: { id: true, employee: true, emp_code: true }, orderBy: { employee: 'asc' },
    });
  }
}

