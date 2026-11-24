import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubStaffInvitationsService } from './club-staff-invitations.service';
import {
  AddStaffInvitationNoteDto,
  AdjustStaffInvitationQuotaDto,
  CreateStaffInvitationDto,
  GenerateStaffInvitationCodesDto,
  StaffInvitationReasonDto,
  UpdateStaffInvitationCodeDto,
  UpdateStaffInvitationSettingsDto,
  UpsertStaffInvitationCodeDto,
} from './dto/staff-invitations.dto';

const VIEW = ['club.staff_invitations:view', 'club.staff_invitations.mine:view'];
/** Recording a guest: the page itself, or reception (the button lives in the reception box). */
const RECORD = ['club.staff_invitations:create', 'club.reception:create'];
const MANAGE = ['club.staff_invitations:update'];

/**
 * «أكواد الدعوات للموظفين»: each employee's invitation code and monthly allowance, recording a
 * guest who came through a code (→ a sales lead), and the guests per employee.
 * Scope inside the service: admin everyone, branch manager their staff, everyone else themself.
 */
@UseGuards(JwtAuthGuard)
@Controller('club-staff-invitations')
export class ClubStaffInvitationsController {
  constructor(private readonly service: ClubStaffInvitationsService) {}

  @Get()
  @RequiresPermission('club.staff_invitations:view')
  list(
    @CurrentUser() user: JwtUser,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('withCode') withCode?: string,
    @Query('status') status?: string,
  ) {
    const id = branchId ? Number(branchId) : undefined;
    if (id !== undefined && (!Number.isInteger(id) || id < 1)) throw new BadRequestException('الفرع غير صالح');
    return this.service.list(user, { branchId: id, search, withCode, status });
  }

  /** The signed-in employee's own code, remaining allowance and guests (no page grant needed). */
  @Get('me')
  mine(@CurrentUser() user: JwtUser) {
    return this.service.mine(user);
  }

  @Get('settings')
  @RequiresPermission(...VIEW, ...RECORD)
  settings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @RequiresPermission(...MANAGE)
  updateSettings(@Body() body: UpdateStaffInvitationSettingsDto, @CurrentUser() user: JwtUser) {
    return this.service.updateSettings(body, user);
  }

  @Get('lookup')
  @RequiresPermission(...RECORD, 'club.staff_invitations:view')
  lookup(@Query('code') code?: string, @Query('employeeId') employeeId?: string) {
    const id = employeeId ? Number(employeeId) : undefined;
    if (!code?.trim() && !id) throw new BadRequestException('اكتب كود الموظف');
    return this.service.lookup({ code, employeeId: id });
  }

  @Get('active-codes')
  @RequiresPermission(...RECORD, 'club.staff_invitations:view')
  activeCodes(@Query('search') search?: string) {
    return this.service.activeCodes(search);
  }

  @Get('check-phone')
  @RequiresPermission(...RECORD)
  checkPhone(@Query('phone') phone?: string) {
    if (!phone?.trim()) throw new BadRequestException('رقم الموبايل مطلوب');
    return this.service.checkPhone(phone);
  }

  @Post()
  @RequiresPermission(...RECORD)
  create(@Body() body: CreateStaffInvitationDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('codes')
  @RequiresPermission(...MANAGE)
  upsertCode(@Body() body: UpsertStaffInvitationCodeDto, @CurrentUser() user: JwtUser) {
    return this.service.upsertCode(body, user);
  }

  @Post('codes/generate-missing')
  @RequiresPermission(...MANAGE)
  generateMissing(@Body() body: GenerateStaffInvitationCodesDto, @CurrentUser() user: JwtUser) {
    return this.service.generateMissing(body, user);
  }

  @Put('codes/:id')
  @RequiresPermission(...MANAGE)
  updateCode(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateStaffInvitationCodeDto, @CurrentUser() user: JwtUser) {
    return this.service.updateCode(id, body, user);
  }

  @Post('codes/:id/adjust')
  @RequiresPermission(...MANAGE)
  adjust(@Param('id', ParseIntPipe) id: number, @Body() body: AdjustStaffInvitationQuotaDto, @CurrentUser() user: JwtUser) {
    return this.service.adjust(id, body, user);
  }

  @Post('codes/:id/deactivate')
  @RequiresPermission(...MANAGE)
  deactivate(@Param('id', ParseIntPipe) id: number, @Body() body: StaffInvitationReasonDto, @CurrentUser() user: JwtUser) {
    return this.service.setActive(id, false, body.reason.trim(), user);
  }

  @Post('codes/:id/activate')
  @RequiresPermission(...MANAGE)
  activate(@Param('id', ParseIntPipe) id: number, @Body() body: StaffInvitationReasonDto, @CurrentUser() user: JwtUser) {
    return this.service.setActive(id, true, body.reason.trim(), user);
  }

  @Get('codes/:id/adjustments')
  @RequiresPermission(...VIEW)
  adjustments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.adjustments(id, user);
  }

  // The next three are open to any signed-in employee: the service limits someone without the
  // page grant to their own code and guests («كود الدعوات الخاص بي»).
  @Get('employees/:employeeId')
  employeeSummary(@Param('employeeId', ParseIntPipe) employeeId: number, @CurrentUser() user: JwtUser) {
    return this.service.employeeSummary(employeeId, user);
  }

  @Get('employees/:employeeId/guests')
  guests(@Param('employeeId', ParseIntPipe) employeeId: number, @CurrentUser() user: JwtUser, @Query('period') period?: string) {
    return this.service.guests(employeeId, user, { period });
  }

  @Post('guests/:id/notes')
  addNote(@Param('id', ParseIntPipe) id: number, @Body() body: AddStaffInvitationNoteDto, @CurrentUser() user: JwtUser) {
    return this.service.addNote(id, body.note, user);
  }
}
