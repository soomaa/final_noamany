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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DailyReportsService } from './daily-reports.service';
import {
  CreateDailyReportDto,
  ListDailyReportsDto,
  RejectDailyReportDto,
  UpdateDailyReportDto,
} from './dto/daily-reports.dto';

@UseGuards(JwtAuthGuard)
@Controller('hr/daily-reports')
export class DailyReportsController {
  constructor(private readonly dailyReports: DailyReportsService) {}

  @Get()
  list(@Query() query: ListDailyReportsDto) {
    return this.dailyReports.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.dailyReports.get(id);
  }

  @Post()
  create(@Body() dto: CreateDailyReportDto) {
    return this.dailyReports.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDailyReportDto) {
    return this.dailyReports.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.dailyReports.remove(id);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.dailyReports.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectDailyReportDto) {
    return this.dailyReports.reject(id, dto);
  }
}
