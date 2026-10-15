import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { FormsSettingsService } from './forms-settings.service';
import { CreateFormSettingDto, UpdateFormSettingDto } from './dto/form-setting.dto';

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
  @RequiresPermission('admin.forms:create')
  create(@Body() body: CreateFormSettingDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequiresPermission('admin.forms:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateFormSettingDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('admin.forms:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
