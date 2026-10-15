import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { FormsSettingsService } from './forms-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('settings/forms')
@RequiresPermission('admin.forms:view')
export class FormsSettingsController {
  constructor(private readonly service: FormsSettingsService) {}

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.service.list(q);
  }

  @Post()
  @RequiresPermission('admin.forms:update')
  create(@Body() body: { title: string; type: number; typeName?: string; maxDegree?: string; inOrder?: number }) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequiresPermission('admin.forms:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: { title?: string; maxDegree?: string; inOrder?: number }) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('admin.forms:update')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
