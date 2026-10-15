import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubEventCheckinService } from './club-event-checkin.service';
import { ScanClubEventCheckinDto, MemberClubEventCheckinDto } from './dto/scan-club-event-checkin.dto';
import { JwtUser } from '../../common/types/jwt-user';

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
  constructor(private readonly service: ClubEventCheckinService) {}

  @Post('scan')
  @RequiresPermission('club.events.checkin:create')
  scan(@Body() body: ScanClubEventCheckinDto, @CurrentUser() user: JwtUser) {
    return this.service.scan(body, user);
  }

  @Post('member')
  @RequiresPermission('club.events.checkin:create')
  byMember(@Body() body: MemberClubEventCheckinDto, @CurrentUser() user: JwtUser) {
    return this.service.byMember(body, user);
  }

  @Post('manual')
  @RequiresPermission('club.events.checkin:create')
  manual(@Body() body: ManualCheckinBody, @CurrentUser() user: JwtUser) {
    return this.service.manual(body.registrationId, body.eventId, body.sessionId, user);
  }

  @Get('event/:eventId')
  roster(@Param('eventId', ParseIntPipe) eventId: number, @CurrentUser() user: JwtUser) {
    return this.service.roster(eventId, user);
  }

  @Get('event/:eventId/statistics')
  statistics(@Param('eventId', ParseIntPipe) eventId: number, @CurrentUser() user: JwtUser) {
    return this.service.statistics(eventId, user);
  }
}

