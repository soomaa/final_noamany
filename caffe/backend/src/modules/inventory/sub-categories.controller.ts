import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListSubCategoriesDto, UpsertSubCategoryDto } from './dto/inventory.dto';
import { SubCategoriesService } from './sub-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('sub-categories')
@RequiresPermission('gym-sales.inventory:view')
export class SubCategoriesController {
  constructor(private readonly service: SubCategoriesService) {}

  @Get()
  list(@Query() query: ListSubCategoriesDto) {
    return this.service.list(query);
  }

  @Get('by-main/:mainId')
  byMain(@Param('mainId', ParseIntPipe) mainId: number) {
    return this.service.byMain(mainId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertSubCategoryDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertSubCategoryDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertSubCategoryDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
