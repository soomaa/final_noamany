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
import { ClubEventScopeService } from './club-event-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
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
    private readonly scope: ClubEventScopeService,
  ) {}

  @Get()
  list(@Query() query: ListClubEventsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, this.scope.eventBranchFilter(user, query.branch));
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(this.scope.eventBranchFilter(user));
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, id);
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.events.list:create')
  create(@Body() body: UpsertClubEventDto, @CurrentUser() user: JwtUser) {
    this.scope.assertBranch(user, body.branchId);
    return this.service.create(body, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('club.events.list:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubEventDto>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, id);
    if (body.branchId != null) this.scope.assertBranch(user, body.branchId);
    return this.service.update(id, body, user.sub);
  }

  @Post(':id/status')
  @RequiresPermission('club.events.list:update')
  async changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeEventStatusDto,
    @CurrentUser('sub') userId: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, id);
    const canApprove = await this.permissionEngine.can(userId, 'club.events.list', 'approve');
    return this.service.changeStatus(id, body, userId, canApprove);
  }

  @Post(':id/duplicate')
  @RequiresPermission('club.events.list:create')
  async duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, id);
    return this.service.duplicate(id, user.sub);
  }

  @Delete(':id')
  @RequiresPermission('club.events.list:delete')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, id);
    return this.service.remove(id, user.sub);
  }
}
