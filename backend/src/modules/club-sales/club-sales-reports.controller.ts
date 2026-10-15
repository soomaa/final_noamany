import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSalesReportsService } from './club-sales-reports.service';
import { DashboardQueryDto } from './dto/leads.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-sales-reports')
export class ClubSalesReportsController {
  constructor(private readonly service: ClubSalesReportsService) {}

  @Get('sales-reps')
  @RequiresPermission('club.sales.reports:view')
  salesReps(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.salesRepsReport(query, user);
  }

  @Get('trainers')
  @RequiresPermission('club.sales.reports:view')
  trainers(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.trainersReport(query, user);
  }

  @Get('sales-reps/export')
  @RequiresPermission('club.sales.reports:export')
  exportSales(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser, @Res() res: Response) {
    return this.service.exportSales(query, user, res);
  }

  @Get('trainers/export')
  @RequiresPermission('club.sales.reports:export')
  exportTrainers(@Query() query: DashboardQueryDto, @CurrentUser() user: JwtUser, @Res() res: Response) {
    return this.service.exportTrainers(query, user, res);
  }

  @Get('trainers/:trainerId/performance')
  @RequiresPermission('club.sales.reports:view')
  trainerPerformance(
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @Query() query: DashboardQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.trainerDrilldown(trainerId, query, user);
  }
}
