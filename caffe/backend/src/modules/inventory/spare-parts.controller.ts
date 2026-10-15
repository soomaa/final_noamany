import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListSparePartsDto, UpsertSparePartDto } from './dto/inventory.dto';
import { SparePartsService } from './spare-parts.service';

@UseGuards(JwtAuthGuard)
@Controller('spare-parts')
@RequiresPermission('gym-sales.inventory:view')
export class SparePartsController {
  constructor(private readonly service: SparePartsService) {}

  @Get()
  list(@Query() query: ListSparePartsDto) {
    return this.service.list(query);
  }

  @Get('by-code/:code')
  byCode(@Param('code') code: string) {
    return this.service.byCode(code);
  }

  @Get('low-stock')
  lowStock() {
    return this.service.lowStock();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertSparePartDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertSparePartDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id/stock')
  @RequiresPermission('gym-sales.inventory:update')
  updateStock(@Param('id', ParseIntPipe) id: number, @Body('currentStock') currentStock: number) {
    return this.service.updateStock(id, currentStock);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
