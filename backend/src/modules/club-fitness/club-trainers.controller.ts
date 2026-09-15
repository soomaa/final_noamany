import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubTrainersService } from './club-trainers.service';
import { ListClubTrainersDto } from './dto/list-club-trainers.dto';
import { ClubTrainerTargetPeriodsService } from './club-trainer-target-periods.service';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

@UseGuards(JwtAuthGuard)
@Controller('club-trainers')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view')
export class ClubTrainersController {
  constructor(
    private readonly service: ClubTrainersService,
    private readonly targetPeriods: ClubTrainerTargetPeriodsService,
    private readonly permissions: PermissionEngineService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Get()
  list(@Query() query: ListClubTrainersDto, @CurrentUser() user: JwtUser) {
    const audience = this.effectiveAudience(query.gender, user);
    return this.service.list(
      query,
      this.branchScope.resolveListFilter(user, query.branch ?? null),
      audience,
    );
  }

  @Get('statistics')
  statistics(@Query() query: ListClubTrainersDto, @CurrentUser() user: JwtUser) {
    const audience = this.effectiveAudience(query.gender, user);
    return this.service.statistics(
      this.branchScope.resolveListFilter(user, query.branch ?? null),
      audience,
    );
  }

  private effectiveAudience(requested: 'male' | 'female' | undefined, user: JwtUser) {
    const locked = this.branchScope.memberGenderFilter(user);
    if (locked && requested && requested !== locked) {
      throw new BadRequestException('لا يمكن تغيير قسم البيانات المسموح به');
    }
    return locked ?? requested ?? null;
  }

  @Get('earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:view')
  allEarningPayments(@CurrentUser() user: JwtUser) {
    return this.service.listEarningPayments(undefined, this.branchScope.allowedBranchIds(user));
  }

  @Get(':id/details')
  async details(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    await this.targetPeriods.assertAccess(id, user!);
    return this.service.findDetails(id, { dateFrom, dateTo });
  }

  @Get(':id/workspace')
  @RequiresPermission('club.fitness.trainers:view')
  async workspace(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    await this.targetPeriods.assertAccess(id, user!);
    const userId = user?.sub ?? 0;
    const [targets, earnings, ratings] = await Promise.all([
      this.permissions.canAny(userId, ['club.fitness.trainer_settings:view']),
      this.permissions.canAny(userId, ['club.fitness.trainer_payments:view']),
      this.permissions.canAny(userId, ['club.fitness.trainer_ratings:view']),
    ]);
    return this.service.workspace(id, { dateFrom, dateTo }, { targets, earnings, ratings });
  }

  @Get(':id/ratings')
  async listRatings(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.listRatings(id);
  }

  @Get(':id/target-periods')
  @RequiresPermission('club.fitness.trainer_settings:view')
  targetPeriodHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.targetPeriods.list(id, user);
  }

  @Put(':id/target-periods/:month')
  @RequiresPermission(
    'club.fitness.trainer_settings:update',
    'club.fitness.trainer_settings:configure',
  )
  saveTargetPeriod(
    @Param('id', ParseIntPipe) id: number,
    @Param('month') month: string,
    @Body() body: { targetValue?: number; targetUnit?: 'members' | 'money'; notes?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.targetPeriods.upsert(id, month, body, user);
  }

  @Get(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:view', 'club.fitness:view')
  async defaultSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser, @Query('classTypeId') classTypeId?: string) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.getDefaultSchedule(id, classTypeId ? Number(classTypeId) : undefined);
  }

  @Put(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:update', 'club.fitness:update')
  async replaceDefaultSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { classTypeId?: number; slots?: Array<Record<string, unknown>> },
    @CurrentUser() user: JwtUser,
  ) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.replaceDefaultSchedule(id, body);
  }

  @Get(':id/earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:view', 'club.subscriptions.special:view')
  async earningPayments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.listEarningPayments(id);
  }

  @Get(':id/earnings-summary')
  @RequiresPermission('club.fitness.trainer_payments:view')
  async earningsSummary(
    @Param('id', ParseIntPipe) id: number,
    @Query('periodFrom') periodFrom: string,
    @Query('periodTo') periodTo: string,
    @CurrentUser() user: JwtUser,
  ) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.earningsSummary(id, periodFrom, periodTo);
  }

  @Post(':id/earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:create', 'club.fitness.trainer_payments:update')
  async createEarningPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount?: number; paymentDate?: string; periodFrom?: string; periodTo?: string; notes?: string },
    @CurrentUser() user: JwtUser,
  ) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.createEarningPayment(id, body, user.sub);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.targetPeriods.assertAccess(id, user);
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Post('external')
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  createExternal(@Body() body: Record<string, unknown>) {
    return this.service.createExternal(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Post(':id/ratings')
  @RequiresPermission('club.fitness:create')
  addRating(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.addRating(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
