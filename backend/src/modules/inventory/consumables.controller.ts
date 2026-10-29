import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListConsumablesDto, SetConsumableStockDto, UpsertConsumableDto } from './dto/inventory.dto';
import { ConsumablesService } from './consumables.service';

@UseGuards(JwtAuthGuard)
@Controller('consumables')
@RequiresPermission('gym-sales.inventory:view')
export class ConsumablesController {
  constructor(private readonly service: ConsumablesService) {}

  @Get()
  list(@Query() query: ListConsumablesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertConsumableDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertConsumableDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Put(':id/set-stock')
  @RequiresPermission('gym-sales.inventory:update')
  setStock(@Param('id', ParseIntPipe) id: number, @Body() body: SetConsumableStockDto, @CurrentUser() user: JwtUser) {
    return this.service.setStock(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
