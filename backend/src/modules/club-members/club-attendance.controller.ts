import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ClubGender } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubAttendanceService } from './club-attendance.service';
import { CheckInDto, CheckOutDto, NextScheduledClassDto, ResolvePendingSubscriptionDto, SetClassTrainerDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';
import { SubscriptionUtilizationDto } from './dto/subscription-utilization.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-attendance')
@RequiresPermission(
  'club.members:view',
  'club.members.attendance:view',
  'club.reception:view',
)
export class ClubAttendanceController {
  constructor(private readonly service: ClubAttendanceService) {}

  @Get('entry-alerts')
  entryAlerts(@Query('branchId') branchId: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.listEntryAlerts(user, branchId);
  }

  @Post('check-in')
  @RequiresPermission(
    'club.members.attendance:create',
    'club.reception:create',
  )
  checkIn(@Body() body: CheckInDto, @CurrentUser() user: JwtUser) {
    return this.service.checkIn(body, user);
  }

  /** Gate entries of members with several subscriptions, waiting for reception's pick. */
  @Get('pending-gate')
  pendingGateEntries(@Query('branchId') branchId: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.listPendingGateEntries(user, branchId);
  }

  @Post(':id/resolve-subscription')
  @RequiresPermission(
    'club.members.attendance:create',
    'club.reception:create',
  )
  resolvePendingSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResolvePendingSubscriptionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.resolvePendingSubscription(id, body.subscriptionId, user);
  }

  @Post(':id/dismiss-pending')
  @RequiresPermission(
    'club.members.attendance:update',
    'club.reception:update',
  )
  dismissPendingGateEntry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.dismissPendingGateEntry(id, user);
  }

  /** Which scheduled class this member is about to be checked into, and who may take it. */
  @Get('next-class')
  nextScheduledClass(@Query() query: NextScheduledClassDto, @CurrentUser() user: JwtUser) {
    return this.service.nextScheduledClass(query, user);
  }

  @Post('class-trainer')
  @RequiresPermission(
    'club.members.attendance:update',
    'club.reception:update',
  )
  setClassTrainer(@Body() body: SetClassTrainerDto, @CurrentUser() user: JwtUser) {
    return this.service.setScheduledClassTrainer(body.classId, body.trainerId, user);
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
    @Query('gender', new ParseEnumPipe(ClubGender, { optional: true })) gender?: ClubGender,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.statistics({ branch, startDate, endDate, gender }, user);
  }

  @Get('daily-summary')
  dailySummary(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.dailySummary(query, user);
  }

  @Get('subscription-utilization')
  subscriptionUtilization(
    @Query() query: SubscriptionUtilizationDto,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.subscriptionUtilization(query, user);
  }

  @Get()
  list(@Query() query: ListClubAttendanceDto, @CurrentUser() user?: JwtUser) {
    return this.service.list(query, user);
  }
}
