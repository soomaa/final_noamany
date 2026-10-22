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
@RequiresPermission('gym-sales.inventory.gym_issue:view', 'gym-sales.inventory.transactions:view')
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

  @Get('drawings')
  @RequiresPermission('gym-sales.sales.drawings:view')
  drawings(@Query() query: ListInventoryTransactionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(Object.assign(query,{businessClassification:'management_withdrawal' as const}),user);
  }

  @Post('drawings')
  @RequiresPermission('gym-sales.sales.new_receipt:create')
  createDrawing(@Body() body: UpsertInventoryTransactionDto, @CurrentUser() user: JwtUser) {
    return this.service.createDrawing(body,user);
  }

  // Static route must precede ':id'.
  @Get('branch-issues')
  @RequiresPermission('gym-sales.inventory.transactions:view', 'gym-sales.inventory.branch_orders:view', 'gym-sales.inventory.branch_items_report:view')
  branchIssues(
    @CurrentUser() user: JwtUser,
    @Query() query: { targetBranchId?: string; dateFrom?: string; dateTo?: string; search?: string; page?: number; pageSize?: number },
  ) {
    return this.service.branchIssues(query, user);
  }

  @Patch(':id/branch-issue-quantities')
  @RequiresPermission('gym-sales.inventory.transactions:update', 'gym-sales.inventory.branch_orders:update')
  reduceBranchIssue(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { items: { itemId: number; quantity: number }[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reduceTransferQuantities(id, body.items, user);
  }

  @Delete(':id/branch-issue')
  @RequiresPermission('gym-sales.inventory.transactions:delete', 'gym-sales.inventory.branch_orders:delete')
  removeBranchIssue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeApprovedTransfer(id, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.gym_issue:create', 'gym-sales.inventory.transactions:create')
  create(@Body() body: UpsertInventoryTransactionDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:update', 'gym-sales.inventory.transactions:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertInventoryTransactionDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:update', 'gym-sales.inventory.transactions:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertInventoryTransactionDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Post(':id/approve')
  @RequiresPermission('gym-sales.inventory.gym_issue:approve', 'gym-sales.inventory.transactions:approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.approve(id, user, isDryRun(dryRun));
  }

  @Post(':id/reject')
  @RequiresPermission('gym-sales.inventory.gym_issue:reject', 'gym-sales.inventory.transactions:reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RejectTransactionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reject(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.gym_issue:delete', 'gym-sales.inventory.transactions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
