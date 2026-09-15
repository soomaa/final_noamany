import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import {
  ListInventoryTransactionsDto,
  RejectTransactionDto,
  UpsertInventoryTransactionDto,
} from './dto/inventory.dto';
import { InventoryTransactionsService } from './inventory-transactions.service';

@UseGuards(JwtAuthGuard)
@Controller('inventory-transactions')
@RequiresPermission('gym-sales.inventory.gym_issue:view')
export class InventoryTransactionsController {
  constructor(private readonly service: InventoryTransactionsService) {}

  @Get()
  list(@Query() query: ListInventoryTransactionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.stats(branchId, user);
  }

  @Get('types')
  types() {
    return this.service.types();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.gym_issue:create')
  create(@Body() body: UpsertInventoryTransactionDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('management-withdrawals')
  @RequiresPermission('gym-sales.inventory.gym_issue:create')
  createManagementWithdrawal(
    @Body() body: UpsertInventoryTransactionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createManagementWithdrawal(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertInventoryTransactionDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertInventoryTransactionDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Post(':id/approve')
  @RequiresPermission('gym-sales.inventory.gym_issue:approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.approve(id, user, isDryRun(dryRun));
  }

  @Post(':id/reject')
  @RequiresPermission('gym-sales.inventory.gym_issue:reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectTransactionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reject(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
