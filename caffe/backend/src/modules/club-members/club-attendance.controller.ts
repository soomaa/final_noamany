import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubAttendanceService } from './club-attendance.service';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-attendance')
@RequiresPermission(
  'club.members:view',
  'club.members.attendance:view',
  'club.reception:view',
)
export class ClubAttendanceController {
  constructor(private readonly service: ClubAttendanceService) {}

  @Post('check-in')
  @RequiresPermission(
    'club.members.attendance:create',
    'club.reception:create',
  )
  checkIn(@Body() body: CheckInDto, @CurrentUser('sub') userId: number) {
    return this.service.checkIn(body, userId);
  }

  @Post('check-out')
  @RequiresPermission(
    'club.members.attendance:update',
    'club.reception:update',
  )
  checkOut(@Body() body: CheckOutDto, @CurrentUser('sub') userId: number) {
    return this.service.checkOut(body, userId);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.statistics({ branch, startDate, endDate });
  }

  @Get('daily-summary')
  dailySummary(@Query() query: ListClubAttendanceDto) {
    return this.service.dailySummary(query);
  }

  @Get()
  list(@Query() query: ListClubAttendanceDto) {
    return this.service.list(query);
  }
}
