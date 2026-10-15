import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClubClassTypesService } from './club-class-types.service';

@UseGuards(JwtAuthGuard)
@Controller('club-class-types')
@RequiresPermission('club.subscriptions.special:view', 'club.fitness:view')
export class ClubClassTypesController {
  constructor(private readonly service: ClubClassTypesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true' || includeInactive === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.subscriptions.special:create', 'club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions.special:update', 'club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions.special:delete', 'club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
