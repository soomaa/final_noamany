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

  @Post()
  create(@Body() dto: CreateMissionDto, @CurrentUser() user: JwtUser) {
    return this.missions.create(dto, user.sub, user.name);
  }

  @Get(':id/expenses')
  expenses(@Param('id', ParseIntPipe) id: number) {
    return this.missions.expenses(id);
  }

  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.approve(id, user.sub, user.name);
  }

  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.reject(id, user.sub, user.name);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.missions.remove(id);
  }
}
