import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { PeriodSummaryService } from './period-summary.service';

/** «ملخص الفترة» — management-meeting summary. Owner/admins only (admin.period_summary). */
@UseGuards(JwtAuthGuard)
@Controller('period-summary')
@RequiresPermission('admin.period_summary:view')
export class PeriodSummaryController {
  constructor(private readonly service: PeriodSummaryService) {}

  @Get()
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
    @Query('groupId') groupId?: string,
    @Query('gender') gender?: string,
  ) {
    return this.service.summary({ from, to, branchId, groupId, gender }, user);
  }
}
