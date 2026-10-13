import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubAttendanceService } from './club-attendance.service';
import { CheckInDto, CheckOutDto, ServiceCheckInDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';
import { BarcodeScanTimesDto } from './dto/barcode-scan-times.dto';

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

  @Post('service-check-in')
  @RequiresPermission('club.fitness:create', 'club.fitness:update', 'club.subscriptions.special:update', 'club.members.attendance:create', 'club.reception:create')
  serviceCheckIn(@Body() body: ServiceCheckInDto, @CurrentUser() user: JwtUser) {
    return this.service.checkInService(body, user);
  }

  @Post('check-out')
  @RequiresPermission(
    'club.members.attendance:update',
    'club.reception:update',
  )
  checkOut(@Body() body: CheckOutDto, @CurrentUser() user: JwtUser) {
    return this.service.checkOut(body, user);
  }

  @Get('member-overview')
  @RequiresPermission(
    'club.members:view',
    'club.members.attendance:view',
    'club.reception:view',
    'club.fitness:view',
  )
  memberOverview(@Query('code') code: string, @CurrentUser() user?: JwtUser, @Query('memberId') memberId?: string) {
    return this.service.memberOverview(code, user, memberId);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.statistics({ branch, startDate, endDate }, user);
  }

  @Get('daily-summary')
  dailySummary(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.dailySummary(query, user);
  }

  @Get('barcode-scan-times')
  @RequiresPermission('club.members.barcode.scan_times:view', 'club.members.barcode_management:view')
  barcodeScanTimes(@Query() query: BarcodeScanTimesDto, @CurrentUser() user: JwtUser) {
    return this.service.barcodeScanTimes(query, user);
  }

  @Get()
  list(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.list(query, user);
  }
}
