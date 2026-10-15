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
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('missions')
@RequiresPermission('leaves.missions:view')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListMissionsDto, @CurrentUser() user: JwtUser) {
    return this.missions.list(query, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('leaves.missions:create')
  create(@Body() dto: CreateMissionDto, @CurrentUser() user: JwtUser) {
    return this.missions.create(dto, user.sub, user.name, user);
  }

  @Get(':id/expenses')
  @ScopedHrData()
  expenses(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.expenses(id, user);
  }

  @Patch(':id/approve')
  @ScopedHrData()
  @RequiresPermission('leaves.missions:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.approve(id, user.sub, user.name, user);
  }

  @Patch(':id/reject')
  @ScopedHrData()
  @RequiresPermission('leaves.missions:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.reject(id, user.sub, user.name, user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('leaves.missions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.missions.remove(id, user);
  }
}
