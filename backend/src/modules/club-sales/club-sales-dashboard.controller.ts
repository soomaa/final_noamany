import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSalesDashboardService } from './club-sales-dashboard.service';
import { DashboardQueryDto } from './dto/leads.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-sales-dashboard')
export class ClubSalesDashboardController {
  constructor(private readonly service: ClubSalesDashboardService) {}

  @Get()
  @RequiresPermission('club.sales.dashboard:view', 'club.sales.reports:view')
  overview(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.overview(query, user);
  }

  @Get('export')
  @RequiresPermission('club.sales.dashboard:export')
  export(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser, @Res() res: Response) {
    return this.service.exportExcel(query, user, res);
  }

  @Get(':salesRepId')
  @RequiresPermission('club.sales.dashboard:view', 'club.sales.reports:view')
  drilldown(
    @Param('salesRepId', ParseIntPipe) salesRepId: number,
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.drilldown(salesRepId, query, user);
  }
}
