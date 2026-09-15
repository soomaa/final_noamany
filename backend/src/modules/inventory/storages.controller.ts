import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListStoragesDto, StorageProductDto, UpsertStorageDto } from './dto/inventory.dto';
import { StoragesService } from './storages.service';

@UseGuards(JwtAuthGuard)
@Controller('storages')
@RequiresPermission('gym-sales.inventory:view')
export class StoragesController {
  constructor(private readonly service: StoragesService) {}

  @Get()
  list(@Query() query: ListStoragesDto) {
    return this.service.list(query);
  }

  @Get(':id/products')
  listProducts(@Param('id', ParseIntPipe) id: number) {
    return this.service.listProducts(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertStorageDto) {
    return this.service.create(body);
  }

  @Post(':id/products')
  @RequiresPermission('gym-sales.inventory:create')
  addProduct(@Param('id', ParseIntPipe) id: number, @Body() body: StorageProductDto) {
    return this.service.addProduct(id, body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertStorageDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertStorageDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
