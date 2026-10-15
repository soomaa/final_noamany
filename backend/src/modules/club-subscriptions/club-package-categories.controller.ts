import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClubPackageCategoriesService } from './club-package-categories.service';

/** "الفئات" tab of the packages screen — the app home sections and their artwork. */
@UseGuards(JwtAuthGuard)
@Controller('club-package-categories')
@RequiresPermission('club.packages.settings:view')
export class ClubPackageCategoriesController {
  constructor(private readonly service: ClubPackageCategoriesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequiresPermission('club.packages.settings:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  // Declared before `:id` so "reorder" is never parsed as an id.
  @Put('reorder')
  @RequiresPermission('club.packages.settings:update')
  reorder(@Body() body: Record<string, unknown>) {
    return this.service.reorder(body);
  }

  @Put(':id')
  @RequiresPermission('club.packages.settings:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.packages.settings:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
