import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
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
  checkIn(@Body() body: CheckInDto, @CurrentUser() user: JwtUser) {
    return this.service.checkIn(body, user);
  }

  @Post('check-out')
  @RequiresPermission(
    'club.members.attendance:update',
    'club.reception:update',
  )
  checkOut(@Body() body: CheckOutDto, @CurrentUser() user: JwtUser) {
    return this.service.checkOut(body, user);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gender') gender?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.statistics({ branch, startDate, endDate, gender }, user);
  }

  @Get('daily-summary')
  dailySummary(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.dailySummary(query, user);
  }

  @Get()
  list(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.list(query, user);
  }
}
