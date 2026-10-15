import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { ClubClassesService } from './club-classes.service';
import { ListClubClassesDto } from './dto/list-club-classes.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

@UseGuards(JwtAuthGuard)
@Controller('club-classes')
@RequiresPermission('club.fitness.personal_sessions:view', 'club.subscriptions.special:view')
export class ClubClassesController {
  constructor(
    private readonly service: ClubClassesService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private async assertResource(userId: number, resource: string, action: string) {
    if (!await this.permissions.can(userId, resource, action)) {
      throw new ForbiddenException('ليس لديك صلاحية لهذا النوع من الحصص');
    }
  }

  private async assertClass(userId: number, id: number, action: string) {
    await this.assertResource(userId, await this.service.permissionResourceForClass(id), action);
  }

  @Get()
  async list(@Query() query: ListClubClassesDto, @CurrentUser() user: JwtUser) {
    await this.assertResource(user.sub, query.personalOnly ? 'club.fitness.personal_sessions' : 'club.subscriptions.special', 'view');
    return this.service.list(query, user);
  }

  @RequiresPermission('club.reception:view')
  @Get('reception-day')
  receptionDay(@Query('branchId') branchId: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.receptionDay(branchId ? Number(branchId) : undefined, user);
  }

  @Post(':id/reception-attendance')
  @RequiresPermission('club.reception:create')
  receptionAttendance(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.receptionAttendance(id, body, user);
  }

  @Get('statistics')
  @RequiresPermission('club.subscriptions.special:view')
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
  @RequiresPermission('club.subscriptions.special:view')
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
  @RequiresPermission('club.subscriptions.special:create')
  generateDefault(
    @Body() body: { weekStart?: string; branchId?: number; classTypeId?: number },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.generateFromDefault(body, user);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.assertClass(user.sub, id, 'view');
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.personal_sessions:create', 'club.subscriptions.special:create')
  async create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    await this.assertResource(user.sub, body.classTypeId ? 'club.subscriptions.special' : 'club.fitness.personal_sessions', 'create');
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.personal_sessions:update', 'club.subscriptions.special:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.assertClass(user.sub, id, 'update');
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.personal_sessions:delete', 'club.subscriptions.special:delete')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.assertClass(user.sub, id, 'delete');
    return this.service.remove(id, user);
  }

  @Post(':id/enroll/:memberId')
  @RequiresPermission('club.fitness.personal_sessions:create', 'club.subscriptions.special:create')
  async enroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query('force') force?: string,
    @Query('bookingSource') bookingSource?: string,
    @Query('subscriptionId') subscriptionId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    if (!user) throw new ForbiddenException();
    await this.assertClass(user.sub, id, 'create');
    return this.service.enrollMember(id, memberId, {
      force: force === 'true' || force === '1',
      bookingSource: bookingSource || 'reception',
      subscriptionId: subscriptionId ? Number(subscriptionId) : undefined,
    }, user);
  }

  @Post(':id/reception-check-in/:memberId')
  @RequiresPermission('club.fitness.personal_sessions:update', 'club.subscriptions.special:update')
  async receptionCheckIn(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.assertClass(user.sub, id, 'update');
    return this.service.receptionCheckIn(id, memberId, user);
  }

  @Get(':id/waitlist')
  async waitlist(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.assertClass(user.sub, id, 'view');
    return this.service.listWaitlist(id, user);
  }

  @Delete(':id/waitlist/:memberId')
  @RequiresPermission('club.fitness.personal_sessions:delete', 'club.subscriptions.special:delete')
  async removeWaitlist(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.assertClass(user.sub, id, 'delete');
    return this.service.removeFromWaitlist(id, memberId, user);
  }

  @Delete(':id/enroll/:memberId')
  @RequiresPermission('club.fitness.personal_sessions:delete', 'club.subscriptions.special:delete')
  async unenroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.assertClass(user.sub, id, 'delete');
    return this.service.unenrollMember(id, memberId, user);
  }

  @Patch(':id/attendance/:memberId')
  @RequiresPermission('club.fitness.personal_sessions:update', 'club.subscriptions.special:update')
  async attendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { attendanceStatus?: string; attendanceTime?: string },
    @CurrentUser() user: JwtUser,
  ) {
    await this.assertClass(user.sub, id, 'update');
    return this.service.updateAttendance(id, memberId, body, user);
  }
}
