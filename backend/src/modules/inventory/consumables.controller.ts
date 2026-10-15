import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListConsumablesDto, SetConsumableStockDto, UpsertConsumableDto } from './dto/inventory.dto';
import { ConsumablesService } from './consumables.service';

@UseGuards(JwtAuthGuard)
@Controller('consumables')
@RequiresPermission('gym-sales.inventory.raw_materials:view')
export class ConsumablesController {
  constructor(private readonly service: ConsumablesService) {}

  @Get()
  list(@Query() query: ListConsumablesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.raw_materials:create')
  create(@Body() body: UpsertConsumableDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertConsumableDto>) {
    return this.service.update(id, body);
  }

  @Put(':id/set-stock')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  setStock(@Param('id', ParseIntPipe) id: number, @Body() body: SetConsumableStockDto) {
    return this.service.setStock(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
