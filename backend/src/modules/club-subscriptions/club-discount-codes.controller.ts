import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { assertSystemAdmin, isSystemAdmin } from '../../common/utils/system-admin.util';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import {
  CreateClubDiscountCodeDto,
  AssignDiscountCodesToEmployeeDto,
  AssignDiscountCodeToEmployeeDto,
  GrantDiscountCodeToMemberDto,
  UpdateClubDiscountCodeDto,
} from './dto/club-discount-code.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-discount-codes')
@RequiresPermission('club.subscriptions:view', 'club.lockers:view')
export class ClubDiscountCodesController {
  constructor(private readonly service: ClubDiscountCodesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true' || includeInactive === '1');
  }

  @Post('employee-assignments')
  assignToEmployee(@Body() body: AssignDiscountCodeToEmployeeDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.assignToEmployee(body, user.sub);
  }

  @Post('employee-assignments/bulk')
  assignManyToEmployee(@Body() body: AssignDiscountCodesToEmployeeDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.assignManyToEmployee(body, user.sub);
  }

  @Put('employee-assignments/employee/:employeeId')
  replaceEmployeeAssignments(@Param('employeeId', ParseIntPipe) employeeId: number, @Body() body: AssignDiscountCodesToEmployeeDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    if (body.employeeId !== employeeId) throw new BadRequestException('رقم الموظف لا يطابق السجل المطلوب تعديله');
    return this.service.replaceEmployeeAssignments(body, user.sub);
  }

  @Get('employee-assignments')
  employeeAssignments(@CurrentUser() user: JwtUser, @Query('employeeId') employeeId?: string) {
    const id = employeeId == null || employeeId === '' ? undefined : Number(employeeId);
    if (id !== undefined && (!Number.isInteger(id) || id < 1)) throw new BadRequestException('رقم الموظف غير صالح');
    return this.service.employeeAssignments(id, user);
  }

  @Delete('employee-assignments/employee/:employeeId')
  deleteEmployeeAssignments(@Param('employeeId', ParseIntPipe) employeeId: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.deleteEmployeeAssignments(employeeId);
  }

  @Post('member-grants')
  grantToMember(@Body() body: GrantDiscountCodeToMemberDto, @CurrentUser() user: JwtUser) {
    // An employee can only issue a code allocated to that same employee. The
    // administrator remains able to issue on behalf of a team member.
    if (!isSystemAdmin(user) && (!user.emp_code || user.emp_code !== body.employeeId)) {
      throw new ForbiddenException('لا يمكنك منح كود باسم موظف آخر');
    }
    return this.service.grantToMember(body, user.sub, user);
  }

  @Get('member-grants')
  memberGrants(
    @CurrentUser() user: JwtUser,
    @Query('memberId') memberId?: string,
    @Query('period') period?: string,
    @Query('gender') gender?: string,
  ) {
    const id = memberId == null || memberId === '' ? undefined : Number(memberId);
    if (id !== undefined && (!Number.isInteger(id) || id < 1)) {
      throw new BadRequestException('رقم العضو غير صالح');
    }
    return this.service.memberGrants(id, user, { currentMonth: period === 'current', gender });
  }

  @Delete('member-grants/:id')
  revokeMemberGrant(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.revokeMemberGrant(id, user);
  }

  @Get('member-grants/search')
  memberGrantsByMemberCode(@CurrentUser() user: JwtUser, @Query('memberCode') memberCode?: string, @Query('gender') gender?: string) {
    if (!memberCode?.trim()) throw new BadRequestException('كود العضوية مطلوب');
    return this.service.memberGrantsByMemberCode(memberCode, user, gender);
  }

  @Get('member-grants/member-lookup')
  findMemberForGrant(@CurrentUser() user: JwtUser, @Query('term') term?: string, @Query('gender') gender?: string) {
    return this.service.findMemberForDiscountGrant(term ?? '', user, gender);
  }

  @Get('reports/usage')
  usageReport(
    @CurrentUser() user: JwtUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('memberCode') memberCode?: string,
    @Query('gender') gender?: string,
  ) {
    if (!fromDate || !toDate) throw new BadRequestException('يجب تحديد تاريخ البداية والنهاية');
    return this.service.usageReport({ fromDate, toDate, memberCode, gender }, user);
  }

  @Post()
  create(@Body() body: CreateClubDiscountCodeDto, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.create(body, user.sub);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateClubDiscountCodeDto,
    @CurrentUser() user: JwtUser,
  ) {
    assertSystemAdmin(user);
    return this.service.update(id, body);
  }

  @Delete(':id')
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.deactivate(id);
  }
}
