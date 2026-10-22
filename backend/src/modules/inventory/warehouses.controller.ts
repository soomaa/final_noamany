import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListWarehousesDto, UpdateWarehouseBalanceDto, UpsertWarehouseDto } from './dto/inventory.dto';
import { WarehousesService } from './warehouses.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('warehouses')
@RequiresPermission('gym-sales.inventory:view', 'gym-sales.inventory.settings:view', 'gym-sales.sales.new_receipt:view', 'gym-sales.procurement.cafe_purchases:view', 'gym-sales.inventory.stock_taking:view', 'gym-sales.inventory.stock_taking_report:view', 'gym-sales.inventory.opening_stock:view', 'gym-sales.inventory.transactions:view')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  list(@Query() query: ListWarehousesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id/inventory')
  warehouseInventory(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.warehouseInventory(id, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create', 'gym-sales.inventory.settings:create')
  create(@Body() body: UpsertWarehouseDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update', 'gym-sales.inventory.settings:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertWarehouseDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update', 'gym-sales.inventory.settings:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertWarehouseDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/inventory/:balanceId')
  @RequiresPermission('gym-sales.inventory:update')
  updateBalance(
    @Param('id', ParseIntPipe) id: number,
    @Param('balanceId', ParseIntPipe) balanceId: number,
    @Body() body: UpdateWarehouseBalanceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateBalance(balanceId, body, id, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete', 'gym-sales.inventory.settings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
