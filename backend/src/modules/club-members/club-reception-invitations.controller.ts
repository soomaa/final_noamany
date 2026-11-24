import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubReceptionInvitationsService } from './club-reception-invitations.service';
import { CreateReceptionInvitationDto } from './dto/reception-invitation.dto';

/** Reception's "إضافة دعوة / ضيف" box: remaining invitations per subscription, and adding a guest. */
@UseGuards(JwtAuthGuard)
@Controller('club-reception-invitations')
export class ClubReceptionInvitationsController {
  constructor(private readonly service: ClubReceptionInvitationsService) {}

  @Get('summary')
  @RequiresPermission('club.reception:view', 'club.members:view', 'app-management.invitations:view')
  summary(@Query('memberId', ParseIntPipe) memberId: number, @CurrentUser() user: JwtUser) {
    return this.service.summary(memberId, user);
  }

  @Post()
  @RequiresPermission('club.reception:create', 'app-management.invitations:create')
  create(@Body() body: CreateReceptionInvitationDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }
}
