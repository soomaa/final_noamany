import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubFacilitiesService } from './club-facilities.service';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-facilities')
@RequiresPermission('club.fitness:view')
export class ClubFacilitiesController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listFacilities(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findFacility(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createFacility(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateFacility(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeFacility(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-equipment')
@RequiresPermission('club.fitness:view')
export class ClubEquipmentController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listEquipment(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findEquipment(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createEquipment(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateEquipment(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeEquipment(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-equipment-maintenance')
@RequiresPermission('club.fitness:view')
export class ClubEquipmentMaintenanceController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @Query('equipmentId') equipmentId?: string) {
    return this.service.listMaintenance(query, equipmentId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findMaintenance(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.service.createMaintenance(body, userId);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.updateMaintenance(id, body, userId);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeMaintenance(id);
  }
}
