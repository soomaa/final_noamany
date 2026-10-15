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
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-events')
@RequiresPermission('club.events.list:view')
export class ClubEventsController {
  constructor(
    private readonly service: ClubEventsService,
    private readonly permissionEngine: PermissionEngineService,
  ) {}

  @Get()
  @RequiresPermission('club.events.list:view', 'club.events.checkin:view')
  async list(@Query() query: ListClubEventsDto, @CurrentUser() user: JwtUser) {
    const canManageList = await this.permissionEngine.can(user.sub, 'club.events.list', 'view');
    if (!canManageList) query.status = 'published';
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.events.list:create')
  create(@Body() body: UpsertClubEventDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  @RequiresPermission('club.events.list:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubEventDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Post(':id/status')
  @RequiresPermission('club.events.list:update', 'club.events.list:approve', 'club.events.list:reject')
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeEventStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    const action = body.status === 'approved' || body.status === 'closed'
      ? 'approve'
      : body.status === 'rejected'
        ? 'reject'
        : 'update';
    const canTransition = await this.permissionEngine.can(user.sub, 'club.events.list', action);
    return this.service.changeStatus(id, body, user, canTransition);
  }

  @Post(':id/duplicate')
  @RequiresPermission('club.events.list:create')
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.duplicate(id, user);
  }

  @Delete(':id')
  @RequiresPermission('club.events.list:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
