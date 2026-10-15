import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
import { CreateAttendanceDeviceDto } from './dto/device.dto';
import { AttendanceDeviceEventBatchDto } from './dto/device-ingest.dto';
import { UpdateAttendanceChannelsDto, UpdateAttendanceRulesDto } from './dto/settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
@RequiresPermission('attendance.board:view')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // -------- rules / settings --------
  @Get('rules')
  @RequiresPermission('attendance.rules:view')
  getRules() {
    return this.attendance.getRules();
  }

  @Patch('rules')
  @RequiresPermission('attendance.rules:configure')
  patchRules(@Body() body: UpdateAttendanceRulesDto) {
    return this.attendance.patchRules(body);
  }

  @Get('settings')
  @RequiresPermission('attendance.settings:view')
  getSettings() {
    return this.attendance.getSettings();
  }

  @Patch('settings')
  @RequiresPermission('attendance.settings:configure')
  patchSettings(@Body() body: UpdateAttendanceChannelsDto) {
    return this.attendance.patchSettings(body);
  }

  // -------- shifts (tbl_hdodr_setting) --------
  @Get('shifts')
  @RequiresPermission('attendance.settings:view')
  listShifts(@Query() query: PaginationDto) {
    return this.attendance.listShifts(query);
  }

  @Post('shifts')
  @RequiresPermission('attendance.settings:create')
  createShift(@Body() dto: UpsertShiftDto) {
    return this.attendance.createShift(dto);
  }

  @Put('shifts/:id')
  @RequiresPermission('attendance.settings:update')
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertShiftDto) {
    return this.attendance.updateShift(id, dto);
  }

  @Delete('shifts/:id')
  @RequiresPermission('attendance.settings:delete')
  removeShift(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShift(id);
  }

  // -------- shift swap / extra shift (tbl_emps_shef_edafi) --------
  @Get('shift-swaps')
  @RequiresPermission('attendance.settings:view')
  listShiftSwaps(@Query() query: ListEdafiDto) {
    return this.attendance.listShiftSwaps(query);
  }

  @Post('shift-swaps')
  @RequiresPermission('attendance.settings:create')
  createShiftSwap(@Body() dto: CreateShiftSwapDto, @CurrentUser('sub') userId: number) {
    return this.attendance.createShiftSwap(dto, userId);
  }

  @Delete('shift-swaps/:id')
  @RequiresPermission('attendance.settings:delete')
  removeShiftSwap(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShiftSwap(id);
  }

  // -------- extra hours (tbl_emps_hours_edafi) --------
  @Get('extra-hours')
  @RequiresPermission('attendance.settings:view')
  listExtraHours(@Query() query: ListEdafiDto) {
    return this.attendance.listExtraHours(query);
  }

  @Post('extra-hours')
  @RequiresPermission('attendance.settings:create')
  createExtraHours(@Body() dto: CreateExtraHoursDto, @CurrentUser('sub') userId: number) {
    return this.attendance.createExtraHours(dto, userId);
  }

  @Delete('extra-hours/:id')
  @RequiresPermission('attendance.settings:delete')
  removeExtraHours(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeExtraHours(id);
  }

  // -------- reports (date-range + employee + branch) --------
  @Get('reports/basma')
  basmaReport(@Query() query: AttendanceReportDto) {
    return this.attendance.basmaReport(query);
  }

  @Get('reports/late')
  lateReport(@Query() query: AttendanceReportDto) {
    return this.attendance.lateReport(query);
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
  @RequiresPermission('attendance.devices:view')
  listDevices(@Query() query: PaginationDto) {
    return this.attendance.listDevices(query);
  }

  @Post('devices')
  @RequiresPermission('attendance.devices:create')
  createDevice(@Body() body: CreateAttendanceDeviceDto) {
    return this.attendance.createDevice(body);
  }

  @Post('devices/connectivity-check-all')
  @RequiresPermission('attendance.devices:execute')
  checkAllConnectivity() {
    return this.attendance.checkAllDeviceConnectivity();
  }

  @Post('devices/:id/rotate-ingest-key')
  @RequiresPermission('attendance.devices:configure')
  rotateIngestKey(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.rotateDeviceIngestKey(id);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('devices/:id/events')
  ingestEvents(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-device-key') deviceKey: string | undefined,
    @Body() body: AttendanceDeviceEventBatchDto,
  ) {
    return this.attendance.ingestDeviceEvents(id, deviceKey, body);
  }

  @Post('devices/:id/connectivity-check')
  @RequiresPermission('attendance.devices:execute')
  checkConnectivity(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.checkDeviceConnectivity(id);
  }

  /** Compatibility endpoint: never report TCP reachability as imported attendance. */
  @Post('devices/:id/sync')
  @RequiresPermission('attendance.devices:execute')
  syncDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.syncDevice(id);
  }

  @Delete('devices/:id')
  @RequiresPermission('attendance.devices:delete')
  removeDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeDevice(id);
  }

  // -------- punch + board --------
  @Post('check')
  @RequiresPermission('attendance.board:update')
  manualCheck(@Body() body: CheckPunchDto, @CurrentUser('sub') userId: number) {
    return this.attendance.manualCheck(body, userId);
  }

  @Get()
  board(@Query() query: ListQueryDto) {
    return this.attendance.board(query);
  }
}
