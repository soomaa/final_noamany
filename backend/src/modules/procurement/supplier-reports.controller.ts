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
  reports(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.reports(query, user);
  }

  @Get('reports/stats')
  stats(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.stats(query, user);
  }

  @Get('reports/performance')
  performance(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.performance(query, user);
  }

  @Get('reports/payments')
  payments(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.payments(query, user);
  }

  @Get('reports/debts')
  debts(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.debts(query, user);
  }

  @Get('reports/orders')
  orders(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.orders(query, user);
  }

  @Get('reports/complaints')
  complaints(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.complaints(query, user);
  }

  @Get('reports/risks')
  risks(@Query() query: SupplierReportsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.risks(query, user);
  }
}
