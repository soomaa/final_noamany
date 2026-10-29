import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { DailyReportsService } from './daily-reports.service';
import {
  CreateDailyReportDto,
  ListDailyReportsDto,
  RejectDailyReportDto,
  UpdateDailyReportDto,
} from './dto/daily-reports.dto';

@UseGuards(JwtAuthGuard)
@Controller('hr/daily-reports')
@RequiresPermission('affairs.daily_reports:view')
export class DailyReportsController {
  constructor(private readonly dailyReports: DailyReportsService) {}

  @Get()
  list(@Query() query: ListDailyReportsDto, @CurrentUser() user: JwtUser) {
    return this.dailyReports.list(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.dailyReports.get(id, user);
  }

  @Post()
  @RequiresPermission('affairs.daily_reports:create')
  create(@Body() dto: CreateDailyReportDto, @CurrentUser() user: JwtUser) {
    return this.dailyReports.create(dto, user);
  }

  @Patch(':id')
  @RequiresPermission('affairs.daily_reports:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDailyReportDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.dailyReports.update(id, dto, user);
  }

  @Delete(':id')
  @RequiresPermission('affairs.daily_reports:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.dailyReports.remove(id, user);
  }

  @Post(':id/approve')
  @RequiresPermission('affairs.daily_reports:update')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.dailyReports.approve(id, user);
  }

  @Post(':id/reject')
  @RequiresPermission('affairs.daily_reports:update')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDailyReportDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.dailyReports.reject(id, dto, user);
  }
}
