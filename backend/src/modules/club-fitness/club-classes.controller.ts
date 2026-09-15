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

@UseGuards(JwtAuthGuard)
@Controller('club-classes')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view')
export class ClubClassesController {
  constructor(private readonly service: ClubClassesService) {}

  @Get()
  list(@Query() query: ListClubClassesDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('trainer') trainer?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.statistics({ branch, trainer, dateFrom, dateTo });
  }

  @Get('management-reports')
  managementReports(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
    @Query('trainerId') trainerId?: string,
    @Query('classTypeId') classTypeId?: string,
  ) {
    return this.service.managementReports({
      dateFrom,
      dateTo,
      branchId: branchId && branchId !== 'all' ? Number(branchId) : undefined,
      trainerId: trainerId && trainerId !== 'all' ? Number(trainerId) : undefined,
      classTypeId: classTypeId && classTypeId !== 'all' ? Number(classTypeId) : undefined,
    });
  }

  @Post('generate-default')
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  generateDefault(@Body() body: { weekStart?: string; branchId?: number; classTypeId?: number }) {
    return this.service.generateFromDefault(body);
  }

  @Get('attendance-report')
  attendanceReport(@Query() query: ListClubClassesDto) {
    return this.service.listAttendanceReport(query);
  }

  @Post('barcode-check-in')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  barcodeCheckInCurrent(@Body('memberCode') memberCode: string, @CurrentUser('sub') userId: number) {
    return this.service.checkInByCurrentBarcode(memberCode, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
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
  ) {
    return this.service.enrollMember(id, memberId, {
      waitlistIfFull: waitlistIfFull === 'true' || waitlistIfFull === '1',
      force: force === 'true' || force === '1',
      bookingSource: bookingSource || 'reception',
      subscriptionId: subscriptionId ? Number(subscriptionId) : undefined,
    });
  }

  @Post(':id/reception-check-in/:memberId')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  receptionCheckIn(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.receptionCheckIn(id, memberId);
  }

  @Post(':id/barcode-check-in')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  barcodeCheckIn(@Param('id', ParseIntPipe) id: number, @Body('memberCode') memberCode: string) {
    return this.service.checkInByBarcode(id, memberCode);
  }

  @Get(':id/waitlist')
  waitlist(@Param('id', ParseIntPipe) id: number) {
    return this.service.listWaitlist(id);
  }

  @Delete(':id/waitlist/:memberId')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  removeWaitlist(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.removeFromWaitlist(id, memberId);
  }

  @Delete(':id/enroll/:memberId')
  @RequiresPermission('club.fitness:delete', 'club.subscriptions.special:delete')
  unenroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.unenrollMember(id, memberId);
  }

  @Patch(':id/attendance/:memberId')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  attendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { attendanceStatus?: string; attendanceTime?: string },
  ) {
    return this.service.updateAttendance(id, memberId, body);
  }
}
