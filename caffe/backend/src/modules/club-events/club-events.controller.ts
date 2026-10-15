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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubEventsService } from './club-events.service';
import { ListClubEventsDto } from './dto/list-club-events.dto';
import { UpsertClubEventDto } from './dto/upsert-club-event.dto';
import { ChangeEventStatusDto } from './dto/change-event-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-events')
@RequiresPermission('club.events.list:view')
export class ClubEventsController {
  constructor(
    private readonly service: ClubEventsService,
    private readonly permissionEngine: PermissionEngineService,
  ) {}

  @Get()
  list(@Query() query: ListClubEventsDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics() {
    return this.service.statistics();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.events.list:create')
  create(@Body() body: UpsertClubEventDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Patch(':id')
  @RequiresPermission('club.events.list:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubEventDto>,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.update(id, body, userId);
  }

  @Post(':id/status')
  @RequiresPermission('club.events.list:update')
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeEventStatusDto,
    @CurrentUser('sub') userId: number,
  ) {
    const canApprove = await this.permissionEngine.can(userId, 'club.events.list', 'approve');
    return this.service.changeStatus(id, body, userId, canApprove);
  }

  @Post(':id/duplicate')
  @RequiresPermission('club.events.list:create')
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.service.duplicate(id, userId);
  }

  @Delete(':id')
  @RequiresPermission('club.events.list:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.service.remove(id, userId);
  }
}
