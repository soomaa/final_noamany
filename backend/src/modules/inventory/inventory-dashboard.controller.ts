import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { DailyStockQueryDto, DashboardSummaryQueryDto } from './dto/inventory.dto';
import { InventoryDashboardService } from './inventory-dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('inventory-dashboard')
export class InventoryDashboardController {
  constructor(private readonly service: InventoryDashboardService) {}

  @Get('summary')
  @RequiresPermission('gym-sales.inventory.dashboard:view')
  summary(@Query() query: DashboardSummaryQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.summary(query, user);
  }


  @Get('daily-stock')
  @RequiresPermission('gym-sales.inventory.dashboard:view', 'gym-sales.inventory.stock_taking:view')
  dailyStock(@Query() query: DailyStockQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.dailyStock(query, user);
  }
}
