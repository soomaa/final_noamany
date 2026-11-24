import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { AttendanceService } from './attendance.service';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';
import { UpsertShiftDto } from './dto/shift.dto';
import { CheckPunchDto } from './dto/check.dto';
import {
  CreateExtraHoursDto,
  CreateShiftSwapDto,
  ListEdafiDto,
} from './dto/edafi.dto';
import { AttendanceReportDto } from './dto/report.dto';
import { JwtUser } from '../../common/types/jwt-user';
// Type-only at decoration time; resolved lazily through ModuleRef (OvertimeRequestsModule imports
// AttendanceModule, so a constructor injection would be a module cycle).
import { OvertimeRequestsService } from '../overtime-requests/overtime-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
@RequiresPermission('attendance:view')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly deviceAgent: AttendanceDeviceAgentService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Overtime requests service (manager entries go to HR instead of being recorded here). */
  private overtimeRequests(): OvertimeRequestsService {
    return this.moduleRef.get(OvertimeRequestsService, { strict: false });
  }

  // -------- rules / settings --------
  @Get('rules')
  getRules() {
    return this.attendance.getRules();
  }

  @Patch('rules')
  @RequiresPermission('attendance:update')
  patchRules(@Body() body: { rules?: unknown[] }) {
    return this.attendance.patchRules(body as Parameters<AttendanceService['patchRules']>[0]);
  }

  @Get('settings')
  getSettings() {
    return this.attendance.getSettings();
  }

  @Patch('settings')
  @RequiresPermission('attendance:update')
  patchSettings(@Body() body: { channels?: Record<string, boolean> }) {
    return this.attendance.patchSettings(body);
  }

  @Get('weekly-schedule-rollout')
  getWeeklyScheduleRollout() {
    return this.attendance.getWeeklyScheduleRollout();
  }

  @Post('weekly-schedule-rollout/activate')
  @RequiresPermission('attendance:update')
  activateWeeklyScheduleRollout() {
    return this.attendance.activateWeeklyScheduleRollout();
  }

  // -------- shifts (tbl_hdodr_setting) --------
  @Get('shifts')
  listShifts(@Query() query: PaginationDto) {
    return this.attendance.listShifts(query);
  }

  @Post('shifts')
  @RequiresPermission('attendance:create')
  createShift(@Body() dto: UpsertShiftDto) {
    return this.attendance.createShift(dto);
  }

  @Put('shifts/:id')
  @RequiresPermission('attendance:update')
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertShiftDto) {
    return this.attendance.updateShift(id, dto);
  }

  @Delete('shifts/:id')
  @RequiresPermission('attendance:delete')
  removeShift(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShift(id);
  }

  // -------- shift swap / extra shift (tbl_emps_shef_edafi) --------
  @Get('shift-swaps')
  listShiftSwaps(@Query() query: ListEdafiDto, @CurrentUser() user: JwtUser) {
    return this.attendance.listShiftSwaps(query, user);
  }

  /**
   * ttype 1 (تبديل شيفت) is recorded as before. ttype 2 (إضافة شيفت) is extra paid work: from a
   * direct manager it becomes a request for HR approval; HR / admin still record it directly.
   */
  @Post('shift-swaps')
  @RequiresPermission('attendance:view', 'hr:view')
  createShiftSwap(@Body() dto: CreateShiftSwapDto, @CurrentUser() user: JwtUser) {
    if (Number(dto.ttype) === 2) {
      return this.overtimeRequests().managerEntry(
        { empId: dto.empId, date: dto.sheftDate, kind: 'shift', shiftId: dto.dwamIdFk, reason: dto.reason },
        user,
      );
    }
    return this.attendance.createShiftSwap(dto, user.sub);
  }

  @Delete('shift-swaps/:id')
  @RequiresPermission('attendance:delete')
  removeShiftSwap(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShiftSwap(id);
  }

  // -------- extra hours (tbl_emps_hours_edafi) --------
  @Get('extra-hours')
  listExtraHours(@Query() query: ListEdafiDto, @CurrentUser() user: JwtUser) {
    return this.attendance.listExtraHours(query, user);
  }

  /**
   * Overtime entered by a direct manager is NOT written here any more: it becomes an overtime
   * request at the HR step (response `{ queued: true, message: 'اتبعت للـ HR للموافقة', id }`).
   * HR / admin entries are still recorded at once through createExtraHours (auto-approved, logged).
   */
  @Post('extra-hours')
  @RequiresPermission('attendance:view', 'hr:view')
  createExtraHours(@Body() dto: CreateExtraHoursDto, @CurrentUser() user: JwtUser) {
    return this.overtimeRequests().managerEntry(
      { empId: dto.empId, date: dto.edafaDate, kind: 'hours', hours: dto.numHours, reason: dto.reason },
      user,
    );
  }

  @Delete('extra-hours/:id')
  @RequiresPermission('attendance:delete')
  removeExtraHours(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeExtraHours(id);
  }

  // -------- compensatory days (worked on the weekly day off) --------
  @Get('comp-days')
  compDays(@Query('empCode') empCode: string | undefined, @CurrentUser() user: JwtUser) {
    return this.attendance.compDays({ empCode }, user);
  }

  // -------- reports (date-range + employee + branch) --------
  @Get('reports/basma')
  basmaReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.basmaReport(query, user);
  }

  @Get('reports/full-sheet')
  fullAttendanceSheet(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.fullAttendanceSheet(query, user);
  }

  @Get('reports/late')
  lateReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.lateReport(query, user);
  }

  @Get('reports/absence')
  absenceReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.absenceReport(query, user);
  }

  @Get('reports/overtime')
  overtimeReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.overtimeReport(query, user);
  }

  @Get('reports/shift-swap')
  shiftSwapReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendance.shiftSwapReport(query, user);
  }

  // -------- devices --------
  @Get('devices')
  listDevices(@Query() query: PaginationDto) {
    return this.attendance.listDevices(query);
  }

  @Post('devices')
  @RequiresPermission('attendance:create')
  createDevice(@Body() body: { title?: string; ip?: string; branchId?: number }) {
    return this.attendance.createDevice(body);
  }

  @Post('devices/sync-all')
  @RequiresPermission('attendance:update')
  syncAll() {
    return this.attendance.syncAllDevices();
  }

  @Post('devices/:id/sync')
  @RequiresPermission('attendance:update')
  syncDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.syncDevice(id);
  }

  @Delete('devices/:id')
  @RequiresPermission('attendance:delete')
  removeDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeDevice(id);
  }

  // -------- punch + board --------
  @Post('check')
  @RequiresPermission('attendance:update')
  manualCheck(@Body() body: CheckPunchDto, @CurrentUser() user: JwtUser) {
    return this.attendance.manualCheckForUser(body, user);
  }

  @Get('manual-options')
  manualOptions(@Query('branchId') branchId: string | undefined, @CurrentUser() user: JwtUser) {
    return this.attendance.manualOptions(user, branchId);
  }

  /**
   * Legacy Hdoor::add_emp_hdoor XLSX layout (multipart field: hdoor_file, optional deviceId).
   * Each actual in/out time is replayed through the attendance engine like a device punch.
   */
  @Post('imports/device-file')
  @RequiresPermission('attendance:create')
  @UseInterceptors(FileInterceptor('hdoor_file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importDeviceFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('deviceId') deviceId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const device = deviceId && deviceId !== '0' ? Number(deviceId) : undefined;
    if (device !== undefined && (!Number.isInteger(device) || device <= 0)) {
      throw new BadRequestException('جهاز البصمة المحدد غير صحيح');
    }
    return this.deviceAgent.importFile(file, user, device);
  }

  @Get()
  board(@Query() query: ListQueryDto, @CurrentUser() user: JwtUser) {
    return this.attendance.board(query, user);
  }
}
