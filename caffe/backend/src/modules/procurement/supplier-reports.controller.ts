import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { SupplierReportsQueryDto } from './dto/procurement-ext.dto';
import { SupplierReportsService } from './supplier-reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('supplier-reports')
@RequiresPermission('gym-sales.procurement:view')
export class SupplierReportsController {
  constructor(private readonly service: SupplierReportsService) {}

  @Get('reports')
  reports(@Query() query: SupplierReportsQueryDto) {
    return this.service.reports(query);
  }

  @Get('reports/stats')
  stats(@Query() query: SupplierReportsQueryDto) {
    return this.service.stats(query);
  }

  @Get('reports/performance')
  performance(@Query() query: SupplierReportsQueryDto) {
    return this.service.performance(query);
  }

  @Get('reports/payments')
  payments(@Query() query: SupplierReportsQueryDto) {
    return this.service.payments(query);
  }

  @Get('reports/debts')
  debts(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.debts(query, user);
  }

  @Get('reports/orders')
  orders(@Query() query: SupplierReportsQueryDto) {
    return this.service.orders(query);
  }

  @Get('reports/complaints')
  complaints(@Query() query: SupplierReportsQueryDto) {
    return this.service.complaints(query);
  }

  @Get('reports/risks')
  risks(@Query() query: SupplierReportsQueryDto) {
    return this.service.risks(query);
  }
}
