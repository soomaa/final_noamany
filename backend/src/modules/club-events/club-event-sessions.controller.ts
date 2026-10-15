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
import { ListClubEventSessionsDto } from './dto/list-club-event-sessions.dto';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-events/:eventId/sessions')
@RequiresPermission('club.events.list:view')
export class ClubEventSessionsController {
  constructor(private readonly service: ClubEventSessionsService) {}

  @Get()
  list(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: ListClubEventSessionsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.list(eventId, query, user);
  }

  @Get(':id')
  findOne(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findOne(eventId, id, user);
  }

  @Post()
  @RequiresPermission('club.events.list:create')
  create(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(eventId, body, user.sub, user);
  }

  @Patch(':id')
  @RequiresPermission('club.events.list:update')
  update(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(eventId, id, body, user.sub, user);
  }

  @Delete(':id')
  @RequiresPermission('club.events.list:delete')
  remove(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.remove(eventId, id, user.sub, user);
  }
}

