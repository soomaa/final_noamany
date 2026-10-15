import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListWarehousesDto, UpdateWarehouseBalanceDto, UpsertWarehouseDto } from './dto/inventory.dto';
import { WarehousesService } from './warehouses.service';

@UseGuards(JwtAuthGuard)
@Controller('warehouses')
@RequiresPermission('gym-sales.inventory:view')
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  list(@Query() query: ListWarehousesDto) {
    return this.service.list(query);
  }

  @Get(':id/inventory')
  warehouseInventory(@Param('id', ParseIntPipe) id: number) {
    return this.service.warehouseInventory(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertWarehouseDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertWarehouseDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertWarehouseDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id/inventory/:balanceId')
  @RequiresPermission('gym-sales.inventory:update')
  updateBalance(
    @Param('balanceId', ParseIntPipe) balanceId: number,
    @Body() body: UpdateWarehouseBalanceDto,
  ) {
    return this.service.updateBalance(balanceId, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
