import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubClassesService } from './club-classes.service';
import { ListClubClassesDto } from './dto/list-club-classes.dto';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-classes')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view')
export class ClubClassesController {
  constructor(private readonly service: ClubClassesService) {}

  @Get()
  list(@Query() query: ListClubClassesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('trainer') trainer?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.statistics({ branch, trainer, dateFrom, dateTo }, user);
  }

  @Get('management-reports')
  managementReports(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
    @Query('trainerId') trainerId?: string,
    @Query('classTypeId') classTypeId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.managementReports({
      dateFrom,
      dateTo,
      branchId: branchId && branchId !== 'all' ? Number(branchId) : undefined,
      trainerId: trainerId && trainerId !== 'all' ? Number(trainerId) : undefined,
      classTypeId: classTypeId && classTypeId !== 'all' ? Number(classTypeId) : undefined,
    }, user);
  }

  @Post('generate-default')
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  generateDefault(@Body() body: { weekStart?: string; branchId?: number; classTypeId?: number }, @CurrentUser() user: JwtUser) {
    return this.service.generateFromDefault(body, user);
  }

  @Get('attendance-report')
  attendanceReport(@Query() query: ListClubClassesDto, @CurrentUser() user: JwtUser) {
    return this.service.listAttendanceReport(query, user);
  }

  @Post('barcode-check-in')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  barcodeCheckInCurrent(@Body('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.checkInByCurrentBarcode(memberCode, user.sub, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/enroll/:memberId')
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  enroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query('waitlistIfFull') waitlistIfFull?: string,
    @Query('force') force?: string,
    @Query('bookingSource') bookingSource?: string,
    @Query('subscriptionId') subscriptionId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.enrollMember(id, memberId, {
      waitlistIfFull: waitlistIfFull === 'true' || waitlistIfFull === '1',
      force: force === 'true' || force === '1',
      bookingSource: bookingSource || 'reception',
      subscriptionId: subscriptionId ? Number(subscriptionId) : undefined,
    }, user);
  }

  @Post(':id/reception-check-in/:memberId')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  receptionCheckIn(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.receptionCheckIn(id, memberId, user);
  }

  @Post(':id/barcode-check-in')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  barcodeCheckIn(@Param('id', ParseIntPipe) id: number, @Body('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.checkInByBarcode(id, memberCode, user);
  }

  @Get(':id/waitlist')
  waitlist(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.listWaitlist(id, user);
  }

  @Delete(':id/waitlist/:memberId')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  removeWaitlist(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.removeFromWaitlist(id, memberId, user);
  }

  @Delete(':id/enroll/:memberId')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  unenroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.unenrollMember(id, memberId, user);
  }

  @Patch(':id/attendance/:memberId')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  attendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { attendanceStatus?: string; attendanceTime?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateAttendance(id, memberId, body, user);
  }
}
