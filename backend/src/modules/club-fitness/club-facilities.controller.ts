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
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-facilities')
@RequiresPermission('club.fitness.facilities:view')
export class ClubFacilitiesController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listFacilities(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findFacility(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.facilities:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createFacility(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.facilities:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateFacility(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.facilities:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeFacility(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-equipment')
@RequiresPermission('club.fitness.equipment:view')
export class ClubEquipmentController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listEquipment(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findEquipment(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.equipment:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createEquipment(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.equipment:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateEquipment(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.equipment:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeEquipment(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-equipment-maintenance')
@RequiresPermission('club.fitness.equipment_maintenance:view')
export class ClubEquipmentMaintenanceController {
  constructor(private readonly service: ClubFacilitiesService) {}

  @Get()
  list(
    @Query() query: ListClubFitnessDto,
    @Query('equipmentId') equipmentId?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.listMaintenance(query, equipmentId, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findMaintenance(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.equipment_maintenance:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createMaintenance(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.equipment_maintenance:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateMaintenance(id, body, user.sub, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.equipment_maintenance:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeMaintenance(id, user);
  }
}
