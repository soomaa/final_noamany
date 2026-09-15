import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Optional,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { MobileService } from './mobile.service';
import {
  CreateLeaveDto,
  CreateVisitDto,
  DeviceTokenDto,
  MobileLoginDto,
  MobileAttendancePunchDto,
  MobileOfflineAttendanceSyncDto,
  MobileActivityDto,
  MobileAttendanceReportListDto,
  MobileDailyTaskDto,
  MobileListDto,
  MobileLoanActionDto,
  MobileLoanListDto,
  MobileLoanRequestDto,
  MobileMessageDto,
  MobileMonthlyStatisticsDto,
  MobileShiftSwapDto,
  MobileExtraHoursDto,
} from './dto/mobile.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { CreatePermissionDto } from '../permissions/dto/create-permission.dto';
import { ActionPermissionDto } from '../permissions/dto/action-permission.dto';
import { ListPermissionsDto } from '../permissions/dto/list-permissions.dto';
import { LeavesService } from '../leaves/leaves.service';
import { ActionLeaveDto } from '../leaves/dto/action-leave.dto';
import { ListLeavesDto } from '../leaves/dto/list-leaves.dto';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceReportDto } from '../attendance/dto/report.dto';
import { LegacyMobileCompatService } from './legacy-mobile-compat.service';
import { LoansService } from '../loans/loans.service';
import { EvaluationWorkflowService } from '../evaluations/evaluation-workflow.service';

@UseGuards(JwtAuthGuard)
@Controller('mobile')
export class MobileController {
  constructor(
    private readonly mobile: MobileService,
    private readonly permissions: PermissionsService,
    private readonly leavesService: LeavesService,
    private readonly attendanceService: AttendanceService,
    private readonly compat: LegacyMobileCompatService,
    private readonly loans: LoansService,
    @Optional() private readonly evaluationWorkflow?: EvaluationWorkflowService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: MobileLoginDto) {
    return this.mobile.login(dto.username, dto.password);
  }

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.mobile.profile(user);
  }

  @Get('statistics/monthly')
  monthlyStatistics(@Query() query: MobileMonthlyStatisticsDto, @CurrentUser() user: JwtUser) {
    return this.mobile.monthlyStatistics(user, query);
  }

  @Post('device-token')
  @HttpCode(200)
  deviceToken(@Body() dto: DeviceTokenDto, @CurrentUser() user: JwtUser) {
    return this.mobile.setDeviceToken(user, dto.token);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: JwtUser) {
    return this.mobile.notifications(user);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.mobile.markNotificationRead(user, id);
  }

  @Get('leaves')
  leaves(@Query() query: ListLeavesDto, @CurrentUser() user: JwtUser) {
    query.mode ??= 'sader';
    return this.leavesService.list(query, user.sub);
  }

  /** Employee-safe lookup used by the leave-request form. */
  @Get('leaves/types')
  leaveTypes() {
    const query = new PaginationDto();
    query.pageSize = 100;
    return this.leavesService.listTypes(query);
  }

  @Post('leaves')
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leavesService.create(dto, user.sub, user.name ?? undefined);
  }

  @Patch('leaves/:id/action')
  actionLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActionLeaveDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leavesService.action(id, dto, user.sub, user.name ?? undefined);
  }

  /** Same ozonat table and approval chain used by the dashboard. */
  @Get('permissions')
  permissionsList(@Query() query: ListPermissionsDto, @CurrentUser() user: JwtUser) {
    query.mode ??= 'sader';
    return this.permissions.list(query, user.sub);
  }

  /** Personal permit balance; never accepts another employee id from the client. */
  @Get('permissions/available')
  permissionAvailability(@Query('date') date: string, @CurrentUser() user: JwtUser) {
    return this.permissions.available(user.emp_code!, date || new Date().toISOString().slice(0, 10));
  }

  @Post('permissions')
  createPermission(@Body() dto: CreatePermissionDto, @CurrentUser() user: JwtUser) {
    return this.permissions.create({ ...dto, empId: undefined }, user.sub, user.name ?? undefined);
  }

  @Patch('permissions/:id/action')
  actionPermission(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActionPermissionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.permissions.action(id, dto, user.sub, user.name ?? undefined);
  }

  /** Detail remains self-scoped, unlike the HR management evaluation register. */
  @Get('permissions/:id')
  async permissionDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    const identity = await this.compat.identity(user);
    return this.permissions.selfDetail(id, identity.id, user.sub);
  }

  @Get('evaluations')
  async myEvaluations(@Query('month') month: string | undefined, @CurrentUser() user: JwtUser) {
    if (!this.evaluationWorkflow) return [];
    const identity = await this.compat.identity(user);
    return this.evaluationWorkflow.myEvaluations(identity.id, { monthKey: month });
  }

  @Get('evaluations/:id')
  async myEvaluation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    if (!this.evaluationWorkflow) return null;
    const identity = await this.compat.identity(user);
    return this.evaluationWorkflow.myEvaluation(identity.id, id);
  }

  /** Legacy Add_Task/Get_Tasks_List use the employee daily-report table. */
  @Get('tasks')
  tasksList(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.mobile.dailyTasks(user, query);
  }

  @Post('tasks')
  createTask(@Body() dto: MobileDailyTaskDto, @CurrentUser() user: JwtUser) {
    return this.mobile.createDailyTask(user, dto);
  }

  @Delete('tasks/:id')
  deleteTask(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.mobile.deleteDailyTask(user, id);
  }

  @Post('attendance/punch')
  attendancePunch(@Body() dto: MobileAttendancePunchDto, @CurrentUser() user: JwtUser) {
    return this.attendanceService.mobilePunch(user, dto);
  }

  @Post('attendance/offline-sync')
  offlineAttendanceSync(@Body() dto: MobileOfflineAttendanceSyncDto, @CurrentUser() user: JwtUser) {
    return this.attendanceService.syncOfflinePunch(user, dto);
  }

  /** Ignores employee and branch filters from the client so reports remain self-only. */
  private async ownAttendanceReportQuery(query: AttendanceReportDto, user: JwtUser) {
    const identity = await this.compat.identity(user);
    return Object.assign(new AttendanceReportDto(), query, {
      empCode: String(identity.empCode),
      branchId: undefined,
    });
  }

  @Get('attendance/reports/basma')
  async mobileBasmaReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendanceService.basmaReport(await this.ownAttendanceReportQuery(query, user));
  }

  @Get('attendance/reports/late')
  async mobileLateReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendanceService.lateReport(await this.ownAttendanceReportQuery(query, user));
  }

  @Get('attendance/reports/absence')
  async mobileAbsenceReport(@Query() query: AttendanceReportDto, @CurrentUser() user: JwtUser) {
    return this.attendanceService.absenceReport(await this.ownAttendanceReportQuery(query, user));
  }

  /** Employee-only replacement/additional shift operations; no HR dashboard permission is required. */
  @Get('attendance/shift-types')
  mobileShiftTypes(@Query() query: PaginationDto) {
    return this.attendanceService.listShifts(query);
  }

  @Get('attendance/shift-swaps')
  mobileShiftSwaps(@Query() query: MobileAttendanceReportListDto, @CurrentUser() user: JwtUser) {
    return this.compat.shiftChanges(user, {
      page: query.page, per_page: query.perPage,
      dateFrom: query.dateFrom, dateTo: query.dateTo, search: query.search,
    });
  }

  /** Static form choices, independent of whether this employee has prior requests. */
  @Get('attendance/shift-operation-types')
  mobileShiftOperationTypes() {
    return [
      { id: 1, title: 'تبديل شيفت', value: 'swap' },
      { id: 2, title: 'إضافة شيفت', value: 'add' },
    ];
  }

  @Post('attendance/shift-swaps')
  async createMobileShiftSwap(@Body() dto: MobileShiftSwapDto, @CurrentUser() user: JwtUser) {
    const employeeId = await this.mobile.employeeIdByPhone(dto.employeePhone);
    return this.attendanceService.createShiftSwap({ ...dto, empId: employeeId }, user.sub);
  }

  @Get('attendance/extra-hours')
  mobileExtraHours(@Query() query: MobileAttendanceReportListDto, @CurrentUser() user: JwtUser) {
    return this.compat.overtime(user, {
      page: query.page, per_page: query.perPage,
      dateFrom: query.dateFrom, dateTo: query.dateTo, search: query.search,
    });
  }

  @Post('attendance/extra-hours')
  async createMobileExtraHours(@Body() dto: MobileExtraHoursDto, @CurrentUser() user: JwtUser) {
    const employeeId = await this.mobile.employeeIdByPhone(dto.employeePhone);
    return this.attendanceService.createExtraHours({ ...dto, empId: employeeId }, user.sub);
  }

  @Get('circulars')
  circulars(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.mobile.circulars(user, query);
  }

  @Get('circulars/:id')
  circular(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.mobile.circular(user, id);
  }

  @Patch('circulars/:id/read')
  markCircularRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.mobile.markCircularRead(user, id);
  }

  @Get('warnings')
  warnings(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.mobile.warnings(user, query);
  }

  @Get('warnings/:id')
  warning(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.mobile.warning(user, id);
  }

  @Patch('warnings/:id/read')
  markWarningRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.mobile.markWarningRead(user, id);
  }

  @Get('requests')
  requests(@CurrentUser() user: JwtUser) {
    return this.mobile.requests(user);
  }

  @Post('visit')
  createVisit(@Body() dto: CreateVisitDto, @CurrentUser() user: JwtUser) {
    return this.mobile.createVisit(user, dto);
  }

  @Get('legal-files')
  legalFiles(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.laws(user, { page: query.page, per_page: query.perPage });
  }

  @Patch('legal-files/:id/read')
  markLegalFileRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.compat.seenLaw(user, { layha_id: id });
  }

  @Get('activities')
  activities(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.activities(user, { page: query.page, per_page: query.perPage });
  }

  @Get('activities/my-requests')
  myActivityRequests(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.activityRequests(user, { page: query.page, per_page: query.perPage }, 'sent');
  }

  @Get('activities/new-requests')
  newActivityRequests(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.activityRequests(user, { page: query.page, per_page: query.perPage }, 'incoming');
  }

  @Post('activities')
  createActivity(@Body() dto: MobileActivityDto, @CurrentUser() user: JwtUser) {
    return this.compat.addActivity(user, { ...dto });
  }

  @Delete('activities/:id')
  deleteActivity(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.compat.deleteActivity(user, { main_id: id });
  }

  @Get('employees')
  employees(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.employees(user, { page: query.page, per_page: query.perPage });
  }

  @Post('messages')
  sendMessage(@Body() dto: MobileMessageDto, @CurrentUser() user: JwtUser) {
    return this.compat.sendMessage(user, {
      to_user_ids: dto.toUserIds,
      subject: dto.subject,
      message: dto.message,
      msg_image: dto.file,
    });
  }

  @Get('messages/inbox')
  inbox(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.inbox(user, { page: query.page, per_page: query.perPage, seen: query.status });
  }

  @Get('messages/sent')
  sent(@Query() query: MobileListDto, @CurrentUser() user: JwtUser) {
    return this.compat.sent(user, { page: query.page, per_page: query.perPage });
  }

  @Get('messages/:id')
  message(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.compat.viewMessage(user, { msg_id: id });
  }

  @Patch('messages/:id/read')
  markMessageRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.compat.seenMessage(user, { msg_id: id });
  }

  @Delete('messages/:id')
  deleteMessage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.compat.deleteMessage(user, { msg_id: id });
  }

  @Get('loans/meta')
  loanMeta(@CurrentUser() user: JwtUser) {
    return this.loans.mobileMeta(user);
  }

  @Get('loans')
  loanRequests(@Query() query: MobileLoanListDto, @CurrentUser() user: JwtUser) {
    return this.loans.mobileList(user, query);
  }

  @Get('loans/:id')
  loanRequest(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.mobileDetail(user, id);
  }

  @Post('loans')
  createLoanRequest(@Body() dto: MobileLoanRequestDto, @CurrentUser() user: JwtUser) {
    return this.loans.mobileCreate(user, dto);
  }

  @Patch('loans/:id/action')
  actionLoanRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MobileLoanActionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.loans.mobileAction(user, id, dto);
  }

  @Delete('loans/:id')
  cancelLoanRequest(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.loans.mobileCancel(user, id);
  }
}
