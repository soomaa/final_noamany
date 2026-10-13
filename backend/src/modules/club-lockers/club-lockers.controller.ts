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
@RequiresPermission('club.lockers:view')
export class ClubLockersController {
  constructor(private readonly service: ClubLockersService) {}

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.lockerStatistics(user);
  }

  @Get()
  listLockers(
    @CurrentUser() user: JwtUser,
    @Query('mainBranchId') mainBranchId?: string,
    @Query('subBranchId') subBranchId?: string,
    @Query('lockerNumber') lockerNumber?: string,
    @Query('isAvailable') isAvailable?: string,
  ) {
    return this.service.listLockers({ mainBranchId, subBranchId, lockerNumber, isAvailable }, user);
  }

  @Get('inventory-snapshot')
  inventorySnapshot(@Query('branchId') branchId: string, @CurrentUser() user: JwtUser) {
    return this.service.inventorySnapshot(Number(branchId), user);
  }

  @Get('inventory-reports')
  inventoryReports(
    @Query('branchId') branchId: string | undefined,
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.listInventoryReports(branchId, user, fromDate, toDate);
  }

  @Post('inventory-reports')
  @RequiresPermission('club.lockers:update')
  createInventoryReport(@Body() body: { branchId: number; employeeId?: number | null; notes?: string; items: { lockerId: number; observedStatus: string; notes?: string }[] }, @CurrentUser() user: JwtUser) {
    return this.service.createInventoryReport(body, user);
  }

  @Delete('inventory-reports/:id')
  @RequiresPermission('club.lockers:update')
  deleteInventoryReport(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.deleteInventoryReport(id, user);
  }

  @Put('inventory-reports/:id')
  @RequiresPermission('club.lockers:update')
  updateInventoryReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { employeeId?: number | null; notes?: string; items?: { lockerId: number; observedStatus: string; notes?: string }[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateInventoryReport(id, body, user);
  }

  @Get(':id/details')
  lockerDetails(@Param('id', ParseIntPipe) id: number) {
    return this.service.getLockerDetails(id);
  }

  @Post()
  @RequiresPermission('club.lockers:create')
  createLocker(@Body() body: { lockerNumber: string; mainBranchId: number; subBranchId: number }) {
    return this.service.createLocker(body);
  }

  @Put(':id')
  @RequiresPermission('club.lockers:update')
  updateLocker(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateLocker(id, body as Parameters<ClubLockersService['updateLocker']>[1]);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers:delete')
  removeLocker(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeLocker(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-locker-types')
@RequiresPermission('club.lockers:view')
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
  @RequiresPermission('club.lockers:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createType(body);
  }

  @Put(':id')
  @RequiresPermission('club.lockers:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateType(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeType(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-locker-subscriptions')
@RequiresPermission('club.lockers:view')
export class ClubLockerSubscriptionsController {
  constructor(private readonly service: ClubLockersService) {}

  @Get()
  list(@Query() query: ListClubLockerSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.listSubscriptions(query, user);
  }

  @Post()
  @RequiresPermission('club.lockers:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.service.createSubscription(body, userId);
  }

  @Put(':id')
  @RequiresPermission('club.lockers:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateSubscription(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.lockers:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSubscription(id);
  }

  @Patch(':id/release')
  @RequiresPermission('club.lockers:update')
  release(@Param('id', ParseIntPipe) id: number) {
    return this.service.releaseSubscription(id);
  }

  @Patch(':id/freeze')
  @RequiresPermission('club.lockers:update')
  freeze(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { days: number },
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.freezeSubscription(id, body.days, isDryRun(dryRun));
  }

  @Patch(':id/unfreeze')
  @RequiresPermission('club.lockers:update')
  unfreeze(@Param('id', ParseIntPipe) id: number, @Query('dryRun') dryRun?: string) {
    return this.service.unfreezeSubscription(id, isDryRun(dryRun));
  }
}
