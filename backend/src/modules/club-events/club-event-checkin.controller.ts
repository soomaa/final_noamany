import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubEventCheckinService } from './club-event-checkin.service';
import { ClubEventScopeService } from './club-event-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ScanClubEventCheckinDto, MemberClubEventCheckinDto } from './dto/scan-club-event-checkin.dto';

class ManualCheckinBody {
  @Transform(({ value }) => Number(value))
  @IsInt()
  registrationId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  eventId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  sessionId?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('club-events/checkin')
@RequiresPermission('club.events.checkin:view')
export class ClubEventCheckinController {
  constructor(
    private readonly service: ClubEventCheckinService,
    private readonly scope: ClubEventScopeService,
  ) {}

  @Post('scan')
  @RequiresPermission('club.events.checkin:create')
  async scan(@Body() body: ScanClubEventCheckinDto, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, body.eventId);
    return this.service.scan(body, user.sub);
  }

  @Post('member')
  @RequiresPermission('club.events.checkin:create')
  async byMember(@Body() body: MemberClubEventCheckinDto, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, body.eventId);
    return this.service.byMember(body, user.sub);
  }

  @Post('manual')
  @RequiresPermission('club.events.checkin:create')
  async manual(@Body() body: ManualCheckinBody, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, body.eventId);
    await this.scope.assertRegistration(user, body.registrationId);
    return this.service.manual(body.registrationId, body.eventId, body.sessionId, user.sub);
  }

  @Get('event/:eventId')
  async roster(@Param('eventId', ParseIntPipe) eventId: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, eventId);
    return this.service.roster(eventId);
  }

  @Get('event/:eventId/statistics')
  async statistics(@Param('eventId', ParseIntPipe) eventId: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, eventId);
    return this.service.statistics(eventId);
  }
}
