import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListBrandsDto, UpsertBrandDto } from './dto/inventory.dto';
import { BrandsService } from './brands.service';

@UseGuards(JwtAuthGuard)
@Controller('brands')
@RequiresPermission('gym-sales.inventory:view', 'gym-sales.inventory.raw_materials:view')
export class BrandsController {
  constructor(private readonly service: BrandsService) {}

  @Get()
  list(@Query() query: ListBrandsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertBrandDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertBrandDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertBrandDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
