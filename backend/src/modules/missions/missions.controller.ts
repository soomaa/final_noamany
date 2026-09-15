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
  list(@Query() query: ListMissionsDto) {
    return this.missions.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.missions.get(id);
  }

  @Post()
  create(@Body() dto: CreateMissionDto, @CurrentUser() user: JwtUser) {
    return this.missions.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMissionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.missions.update(id, dto, user.sub);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.missions.remove(id);
  }
}
