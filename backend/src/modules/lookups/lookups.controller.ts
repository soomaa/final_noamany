import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LookupsService } from './lookups.service';

class LookupItemDto {
  @IsString()
  @MinLength(1, { message: 'الاسم مطلوب' })
  title!: string;

  /** sort order (in_order) — supported by catalogs that carry it */
  @IsOptional()
  @IsInt()
  order?: number;

  /** parent city id, for the `hai` (الأحياء) catalog */
  @IsOptional()
  @IsInt()
  parentId?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get()
  catalog() {
    return this.lookups.catalog();
  }

  @Get(':type')
  list(@Param('type') type: string, @Query('parent') parent?: string) {
    const parentId = parent !== undefined && parent !== '' ? Number(parent) : undefined;
    return this.lookups.list(type, Number.isNaN(parentId as number) ? undefined : parentId);
  }

  @Post(':type')
  @RequiresPermission('admin.forms:update')
  create(@Param('type') type: string, @Body() dto: LookupItemDto) {
    return this.lookups.create(type, dto.title, { order: dto.order, parentId: dto.parentId });
  }

  @Patch(':type/:id')
  @RequiresPermission('admin.forms:update')
  update(@Param('type') type: string, @Param('id', ParseIntPipe) id: number, @Body() dto: LookupItemDto) {
    return this.lookups.update(type, id, dto.title, { order: dto.order, parentId: dto.parentId });
  }

  @Delete(':type/:id')
  @RequiresPermission('admin.forms:update')
  remove(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.lookups.remove(type, id);
  }
}
