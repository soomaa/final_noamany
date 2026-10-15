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
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import { ClubLockersService } from './club-lockers.service';
import { ListClubLockerSubscriptionsDto } from './dto/list-club-locker-subscriptions.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-lockers')
@RequiresPermission('club.lockers.list:view', 'club.lockers.new:view')
export class ClubLockersController {
  constructor(private readonly service: ClubLockersService) {}

  @Get('split')
  @RequiresPermission('club.lockers.list:view', 'club.lockers.list:update', 'club.lockers.settings:update')
  lockerSplit() {
    return this.service.getLockerSplit();
  }

  @Patch('split')
  @RequiresPermission('club.lockers.list:update', 'club.lockers.settings:update')
  setLockerSplit(@Body() body: { enabled?: boolean }) {
    return this.service.setLockerSplit(body?.enabled === true);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.lockerStatistics(user);
  }

  @Get('desk')
  @RequiresPermission('club.reception:view', 'club.reception:create', 'club.reception:update', 'club.members.attendance:create', 'club.lockers.list:view', 'club.lockers.new:view')
  desk(@Query('memberId') memberId: string, @CurrentUser() user: JwtUser) {
    return this.service.deskOptions(Number(memberId), user);
  }

  @Get('handoffs/open')
  @RequiresPermission('club.reception:view', 'club.reception:create', 'club.reception:update', 'club.members.attendance:create', 'club.lockers.list:view', 'club.lockers.new:view')
  openHandoffs(@Query('branchId') branchId: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.listOpenHandoffs(branchId, user);
  }

  @Post('handoff')
  @RequiresPermission('club.reception:create', 'club.reception:update', 'club.members.attendance:create', 'club.lockers.list:update')
  handoff(
    @Body() body: { lockerId: number; memberId: number },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.assignHandoff(body, user);
  }

  @Post('handoff/release')
  @RequiresPermission('club.reception:create', 'club.reception:update', 'club.members.attendance:create', 'club.lockers.list:update')
  releaseHandoff(@Body() body: { memberId: number }, @CurrentUser() user: JwtUser) {
    return this.service.releaseHandoff(Number(body?.memberId), user);
  }

  @Get()
  listLockers(
    @Query('mainBranchId') mainBranchId?: string,
    @Query('subBranchId') subBranchId?: string,
    @Query('lockerNumber') lockerNumber?: string,
    @Query('isAvailable') isAvailable?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.listLockers({ mainBranchId, subBranchId, lockerNumber, isAvailable }, user);
  }

  @Get(':id/details')
  lockerDetails(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.getLockerDetails(id, user);
  }

  @Post()
  @RequiresPermission('club.lockers.list:create', 'club.lockers.new:create')
  createLocker(
    @Body() body: { lockerNumber: string; mainBranchId: number; subBranchId: number; section?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createLocker(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.lockers.list:update')
  updateLocker(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateLocker(id, body as Parameters<ClubLockersService['updateLocker']>[1], user);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers.list:delete')
  removeLocker(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeLocker(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-locker-types')
@RequiresPermission('club.lockers.settings:view')
export class ClubLockerTypesController {
  constructor(private readonly service: ClubLockersService) {}

  @Get('all')
  listAll() {
    return this.service.listTypes();
  }

  @Get()
  list() {
    return this.service.listTypes();
  }

  @Post()
  @RequiresPermission('club.lockers.settings:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createType(body);
  }

  @Put(':id')
  @RequiresPermission('club.lockers.settings:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateType(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers.settings:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeType(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-locker-subscriptions')
@RequiresPermission('club.lockers.list:view', 'club.lockers.new:view')
export class ClubLockerSubscriptionsController {
  constructor(private readonly service: ClubLockersService) {}

  @Get()
  list(@Query() query: ListClubLockerSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.listSubscriptions(query, user);
  }

  @Post()
  @RequiresPermission('club.lockers.list:create', 'club.lockers.new:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createSubscription(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.lockers.list:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateSubscription(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers.list:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeSubscription(id, user);
  }

  @Patch(':id/release')
  @RequiresPermission('club.lockers.list:update')
  release(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.releaseSubscription(id, user);
  }

  @Patch(':id/freeze')
  @RequiresPermission('club.lockers.list:update')
  freeze(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { days: number },
    @Query('dryRun') dryRun?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.freezeSubscription(id, body.days, isDryRun(dryRun), user);
  }

  @Patch(':id/unfreeze')
  @RequiresPermission('club.lockers.list:update')
  unfreeze(
    @Param('id', ParseIntPipe) id: number,
    @Query('dryRun') dryRun?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.unfreezeSubscription(id, isDryRun(dryRun), user);
  }
}
