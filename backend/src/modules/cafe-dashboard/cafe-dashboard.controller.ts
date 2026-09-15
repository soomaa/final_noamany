import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { CafeDashboardService } from './cafe-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('cafe-dashboard')
export class CafeDashboardController {
  constructor(private readonly service: CafeDashboardService) {}
  @Get('summary')
  @RequiresPermission('club.cafe.dashboard:view', 'club.cafe.reports:view')
  summary(@Query() query: { startDate?: string; endDate?: string; branchId?: string }, @CurrentUser() user: JwtUser) {
    return this.service.summary(query, user);
  }
}

