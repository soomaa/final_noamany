import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListMainCategoriesDto, UpsertMainCategoryDto } from './dto/inventory.dto';
import { MainCategoriesService } from './main-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('main-categories')
@RequiresPermission('gym-sales.inventory:view')
export class MainCategoriesController {
  constructor(private readonly service: MainCategoriesService) {}

  @Get()
  list(@Query() query: ListMainCategoriesDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertMainCategoryDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertMainCategoryDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertMainCategoryDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
