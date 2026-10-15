import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CategoriesService } from './categories.service';
import { ListCategoriesDto, UpdateCategoryOrderDto, UpdateCategoryStatusDto, UpsertCategoryDto } from './dto/inventory.dto';

@UseGuards(JwtAuthGuard)
@Controller('categories')
@RequiresPermission(
  'club.cafe.categories:view',
  'club.cafe.products:view',
  'gym-sales.sales.new_receipt:view',
  'gym-sales.inventory.raw_materials:view',
)
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(@Query() query: ListCategoriesDto) {
    return this.service.list(query);
  }

  @Get('root')
  root() {
    return this.service.root();
  }

  @Patch('order')
  @RequiresPermission('club.cafe.categories:update')
  updateOrder(@Body() body: UpdateCategoryOrderDto) {
    return this.service.updateOrder(body.categoryIds);
  }

  @Get(':id/children')
  children(@Param('id', ParseIntPipe) id: number) {
    return this.service.children(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.cafe.categories:create')
  create(@Body() body: UpsertCategoryDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.cafe.categories:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertCategoryDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('club.cafe.categories:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertCategoryDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequiresPermission('club.cafe.categories:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCategoryStatusDto) {
    return this.service.updateStatus(id, body.isActive);
  }

  @Delete(':id')
  @RequiresPermission('club.cafe.categories:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
