import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ClubEventDisplaySettingsService,
  ClubEventLiveCheckinService,
  ClubEventProgramSegmentsService,
} from './club-event-live.service';
import {
  CreateProgramSegmentDto,
  GuestByPhoneQuery,
  GuestLiveCheckinDto,
  ProgramSegmentListQuery,
  UpdateProgramSegmentDto,
} from './dto/club-event-live.dto';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-events/:eventId/live')
@RequiresPermission('club.events.list:view')
export class ClubEventLiveController {
  constructor(
    private readonly settings: ClubEventDisplaySettingsService,
    private readonly segments: ClubEventProgramSegmentsService,
    private readonly liveCheckin: ClubEventLiveCheckinService,
  ) {}

  @Get('display-settings')
  getSettings(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.settings.get(eventId, user);
  }

  @Put('display-settings')
  @RequiresPermission('club.events.list:update')
  updateSettings(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.settings.update(eventId, body, user.sub, user);
  }

  @Get('program-segments')
  listSegments(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() q: ProgramSegmentListQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.segments.list(eventId, q, user);
  }

  @Get('program-segments/:id')
  getSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.segments.get(eventId, id, user);
  }

  @Post('program-segments')
  @RequiresPermission('club.events.list:create')
  createSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: CreateProgramSegmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.segments.create(eventId, body, user.sub, user);
  }

  @Patch('program-segments/:id')
  @RequiresPermission('club.events.list:update')
  updateSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProgramSegmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.segments.update(eventId, id, body, user.sub, user);
  }

  @Delete('program-segments/:id')
  @RequiresPermission('club.events.list:delete')
  removeSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.segments.remove(eventId, id, user.sub, user);
  }

  @Get('attendees/by-phone')
  @RequiresPermission('club.events.checkin:view')
  getByPhone(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() q: GuestByPhoneQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.liveCheckin.getByPhone(eventId, q, user);
  }

  @Get('attendees/recent')
  @RequiresPermission('club.events.checkin:view')
  recentAttendees(
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.liveCheckin.recentCheckins(eventId, 50, user);
  }

  @Post('guest-checkin')
  @RequiresPermission('club.events.checkin:create')
  guestCheckin(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: GuestLiveCheckinDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.liveCheckin.guestCheckin(eventId, body, user);
  }
}
