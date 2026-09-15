import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubDashboardService } from './club-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('club-dashboard')
@RequiresPermission('club.dashboard:view')
export class ClubDashboardController {
  constructor(private readonly service: ClubDashboardService) {}

  @Get('treasury')
  @RequiresPermission(
    'club.dashboard:view',
    'club.subscriptions.treasury:view',
  )
  treasury(
    @CurrentUser() user: JwtUser,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.treasury({ date, dateFrom, dateTo, branchId }, user);
  }

  @Get('summary')
  summary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.summary({ startDate, endDate, branchId }, user);
  }
}
