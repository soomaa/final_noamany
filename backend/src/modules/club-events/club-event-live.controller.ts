import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ClubEventDisplaySettingsService,
  ClubEventLiveCheckinService,
  ClubEventProgramSegmentsService,
} from './club-event-live.service';
import { ClubEventScopeService } from './club-event-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateProgramSegmentDto,
  GuestByPhoneQuery,
  GuestLiveCheckinDto,
  ProgramSegmentListQuery,
  UpdateProgramSegmentDto,
} from './dto/club-event-live.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-events/:eventId/live')
@RequiresPermission('club.events.list:view')
export class ClubEventLiveController {
  constructor(
    private readonly settings: ClubEventDisplaySettingsService,
    private readonly segments: ClubEventProgramSegmentsService,
    private readonly liveCheckin: ClubEventLiveCheckinService,
    private readonly scope: ClubEventScopeService,
  ) {}

  @Public()
  @Get('display-settings')
  getSettings(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.settings.get(eventId);
  }

  @Put('display-settings')
  @RequiresPermission('club.events.list:update')
  async updateSettings(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.settings.update(eventId, body, user.sub);
  }

  @Public()
  @Get('program-segments')
  listSegments(@Param('eventId', ParseIntPipe) eventId: number, @Query() q: ProgramSegmentListQuery) {
    return this.segments.list(eventId, q);
  }

  @Get('program-segments/:id')
  async getSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.segments.get(eventId, id);
  }

  @Post('program-segments')
  @RequiresPermission('club.events.list:update')
  async createSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: CreateProgramSegmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.segments.create(eventId, body, user.sub);
  }

  @Patch('program-segments/:id')
  @RequiresPermission('club.events.list:update')
  async updateSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProgramSegmentDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.segments.update(eventId, id, body, user.sub);
  }

  @Delete('program-segments/:id')
  @RequiresPermission('club.events.list:update')
  async removeSegment(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertEvent(user, eventId);
    return this.segments.remove(eventId, id, user.sub);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('attendees/by-phone')
  getByPhone(@Param('eventId', ParseIntPipe) eventId: number, @Query() q: GuestByPhoneQuery) {
    return this.liveCheckin.getByPhone(eventId, q);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('attendees/recent')
  async recentAttendees(@Param('eventId', ParseIntPipe) eventId: number) {
    const result = await this.liveCheckin.recentCheckins(eventId);
    return {
      ...result,
      // The public display feed must not expose attendee phone numbers.
      data: result.data.map(({ phone: _phone, ...attendee }) => attendee),
    };
  }

  @Get('attendees/recent-private')
  async recentAttendeesPrivate(@Param('eventId', ParseIntPipe) eventId: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, eventId);
    return this.liveCheckin.recentCheckins(eventId);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('guest-checkin')
  guestCheckin(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() body: GuestLiveCheckinDto,
    @CurrentUser('sub') userId?: number,
  ) {
    return this.liveCheckin.guestCheckin(eventId, body, userId);
  }
}
