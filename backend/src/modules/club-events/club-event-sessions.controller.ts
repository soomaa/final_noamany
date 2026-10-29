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
import { ClubEventSessionsService } from './club-event-sessions.service';
import { ClubEventScopeService } from './club-event-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ListClubEventSessionsDto } from './dto/list-club-event-sessions.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-events/:eventId/sessions')
@RequiresPermission('club.events.list:view')
export class ClubEventSessionsController {
  constructor(
    private readonly service: ClubEventSessionsService,
    private readonly scope: ClubEventScopeService,
  ) {}

  @Get()
  async list(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: ListClubEventSessionsDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.service.list(eventId, query);
  }

  @Get(':id')
  async findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.service.findOne(eventId, id);
  }

  @Post()
  @RequiresPermission('club.events.list:create')
  async create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.service.create(eventId, body, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('club.events.list:update')
  async update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.service.update(eventId, id, body, user.sub);
  }

  @Delete(':id')
  @RequiresPermission('club.events.list:delete')
  async remove(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.service.remove(eventId, id, user.sub);
  }
}
