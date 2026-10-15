import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubInvitationsService } from './club-invitations.service';
import { CreateInvitationDto } from './dto/leads.dto';
import { parseOptionalMemberId } from './invitation-package.util';

@UseGuards(JwtAuthGuard)
@Controller('club-invitations')
export class ClubInvitationsController {
  constructor(private readonly service: ClubInvitationsService) {}

  @Get()
  @RequiresPermission('club.reception:view', 'club.members:view')
  list(@Query('memberId') memberId: string | undefined, @CurrentUser() user: JwtUser) {
    const id = parseOptionalMemberId(memberId);
    if (id) return this.service.summaryForMember(id, user);
    return this.service.listRecent(user);
  }

  @Get('summary')
  @RequiresPermission('club.reception:view', 'club.members:view')
  summary(@Query('memberId') memberId: string | undefined, @CurrentUser() user: JwtUser) {
    const id = parseOptionalMemberId(memberId);
    if (!id) throw new BadRequestException('رقم العضو مطلوب');
    return this.service.summaryForMember(id, user);
  }

  @Get('member/:memberId')
  @RequiresPermission('club.reception:view', 'club.members:view')
  forMember(@Param('memberId', ParseIntPipe) memberId: number, @CurrentUser() user: JwtUser) {
    return this.service.summaryForMember(memberId, user);
  }

  @Post()
  @RequiresPermission('club.reception:create', 'club.reception:update', 'club.members:create', 'club.members:update')
  create(@Body() body: CreateInvitationDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }
}
