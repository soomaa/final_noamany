import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import {
  BatchServiceConsumableDto,
  ListServiceConsumablesDto,
  UpsertServiceConsumableDto,
} from './dto/inventory.dto';
import { ServiceConsumablesService } from './service-consumables.service';

@UseGuards(JwtAuthGuard)
@Controller('service-consumables')
@RequiresPermission('gym-sales.inventory:view')
export class ServiceConsumablesController {
  constructor(private readonly service: ServiceConsumablesService) {}

  @Get()
  list(@Query() query: ListServiceConsumablesDto) {
    return this.service.list(query);
  }

  @Get('by-service/:serviceId')
  byService(@Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.service.byService(serviceId);
  }

  @Post('batch')
  @RequiresPermission('gym-sales.inventory:create')
  batchCreate(@Body() body: BatchServiceConsumableDto) {
    return this.service.batchCreate(body);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertServiceConsumableDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertServiceConsumableDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
