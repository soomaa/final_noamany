import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { DashboardService } from './dashboard.service';
import { ClubDashboardService } from '../club-dashboard/club-dashboard.service';

@UseGuards(JwtAuthGuard)
@RequiresPermission('admin.dashboard:view')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly clubDashboard: ClubDashboardService,
  ) {}

  @Get('executive')
  executive(
    @CurrentUser() user: JwtUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.clubDashboard.executive({ startDate, endDate, branchId }, user);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: JwtUser,
    @Query('branch') branch?: string,
    @Query('manWomen') manWomen?: string,
  ) {
    const parsedBranch = branch === 'all' || branch == null ? 'all' : Number(branch);
    const parsedManWomen = manWomen != null && manWomen !== '' ? Number(manWomen) : undefined;
    return this.dashboard.getSummary(user, parsedBranch, parsedManWomen);
  }
}
