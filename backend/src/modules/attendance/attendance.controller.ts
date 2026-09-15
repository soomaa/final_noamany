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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { AttendanceService } from './attendance.service';
import { UpsertShiftDto } from './dto/shift.dto';
import { CheckPunchDto } from './dto/check.dto';
import {
  CreateExtraHoursDto,
  CreateShiftSwapDto,
  ListEdafiDto,
} from './dto/edafi.dto';
import { AttendanceReportDto } from './dto/report.dto';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
@RequiresPermission('attendance:view')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

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
  listShiftSwaps(@Query() query: ListEdafiDto) {
    return this.attendance.listShiftSwaps(query);
  }

  @Post('shift-swaps')
  @RequiresPermission('attendance:view', 'hr:view')
  createShiftSwap(@Body() dto: CreateShiftSwapDto, @CurrentUser('sub') userId: number) {
    return this.attendance.createShiftSwap(dto, userId);
  }

  @Delete('shift-swaps/:id')
  @RequiresPermission('attendance:delete')
  removeShiftSwap(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShiftSwap(id);
  }

  // -------- extra hours (tbl_emps_hours_edafi) --------
  @Get('extra-hours')
  listExtraHours(@Query() query: ListEdafiDto) {
    return this.attendance.listExtraHours(query);
  }

  @Post('extra-hours')
  @RequiresPermission('attendance:view', 'hr:view')
  createExtraHours(@Body() dto: CreateExtraHoursDto, @CurrentUser('sub') userId: number) {
    return this.attendance.createExtraHours(dto, userId);
  }

  @Delete('extra-hours/:id')
  @RequiresPermission('attendance:delete')
  removeExtraHours(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeExtraHours(id);
  }

  // -------- reports (date-range + employee + branch) --------
  @Get('reports/basma')
  basmaReport(@Query() query: AttendanceReportDto) {
    return this.attendance.basmaReport(query);
  }

  @Get('reports/full-sheet')
  fullAttendanceSheet(@Query() query: AttendanceReportDto) {
    return this.attendance.fullAttendanceSheet(query);
  }

  @Get('reports/late')
  lateReport(@Query() query: AttendanceReportDto) {
    return this.attendance.lateReport(query);
  }

  @Get('reports/absence')
  absenceReport(@Query() query: AttendanceReportDto) {
    return this.attendance.absenceReport(query);
  }

  @Get('reports/overtime')
  overtimeReport(@Query() query: AttendanceReportDto) {
    return this.attendance.overtimeReport(query);
  }

  @Get('reports/shift-swap')
  shiftSwapReport(@Query() query: AttendanceReportDto) {
    return this.attendance.shiftSwapReport(query);
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

  @Get('barcode-preview')
  barcodePreview(
    @Query('empCode') empCode: string,
    @Query('branchId') branchId: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.attendance.barcodePreviewForUser(empCode, user, branchId);
  }

  @Post('barcode-punch')
  @RequiresPermission('attendance:update')
  barcodePunch(@Body() body: Pick<CheckPunchDto, 'empCode' | 'branchId'>, @CurrentUser() user: JwtUser) {
    return this.attendance.barcodePunchForUser(body, user);
  }

  /** Legacy Hdoor::add_emp_hdoor XLSX import (multipart field: hdoor_file). */
  @Post('imports/device-file')
  @RequiresPermission('attendance:create')
  @UseInterceptors(FileInterceptor('hdoor_file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  importDeviceFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: number,
    @CurrentUser('name') userName?: string,
  ) {
    return this.attendance.importDeviceFile(file, userId, userName);
  }

  @Get()
  board(@Query() query: ListQueryDto) {
    return this.attendance.board(query);
  }
}
