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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateMissionDto } from './dto/create-mission.dto';
import { ListMissionsDto } from './dto/list-missions.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';
import { MissionsService } from './missions.service';

@UseGuards(JwtAuthGuard)
@Controller('missions')
@RequiresPermission('leaves.missions:view')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  list(@Query() query: ListMissionsDto, @CurrentUser() user: JwtUser) {
    return this.missions.list(query, user);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.get(id, user);
  }

  @Post()
  @RequiresPermission('leaves.missions:create')
  create(@Body() dto: CreateMissionDto, @CurrentUser() user: JwtUser) {
    return this.missions.create(dto, user);
  }

  @Patch(':id')
  @RequiresPermission('leaves.missions:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMissionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.missions.update(id, dto, user);
  }

  @Delete(':id')
  @RequiresPermission('leaves.missions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.remove(id, user);
  }
}
