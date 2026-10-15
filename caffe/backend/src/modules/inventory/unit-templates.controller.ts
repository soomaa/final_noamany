import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListUnitTemplatesDto, UpsertUnitTemplateDto } from './dto/inventory.dto';
import { UnitTemplatesService } from './unit-templates.service';

@UseGuards(JwtAuthGuard)
@Controller('unit-templates')
@RequiresPermission('gym-sales.inventory:view')
export class UnitTemplatesController {
  constructor(private readonly service: UnitTemplatesService) {}

  @Get()
  list(@Query() query: ListUnitTemplatesDto) {
    return this.service.list(query);
  }

  @Get('active')
  active() {
    return this.service.active();
  }

  @Get('by-category/:category')
  byCategory(@Param('category') category: string) {
    return this.service.byCategory(category);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertUnitTemplateDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertUnitTemplateDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertUnitTemplateDto>) {
    return this.service.update(id, body);
  }

  @Post(':id/increment-usage')
  @RequiresPermission('gym-sales.inventory:update')
  incrementUsage(@Param('id', ParseIntPipe) id: number) {
    return this.service.incrementUsage(id);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
