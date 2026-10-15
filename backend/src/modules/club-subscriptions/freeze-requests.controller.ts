import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from '../member/guards/member-jwt-auth.guard';
import { FreezeRequestsService } from './freeze-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('club-freeze-requests')
export class FreezeRequestsController {
  constructor(private readonly service: FreezeRequestsService) {}

  @Get()
  @RequiresPermission('club.subscriptions.freeze_requests:view', 'club.subscriptions.list:view')
  list(@CurrentUser() user: JwtUser, @Query('status') status?: string, @Query('branchId') branchId?: string) {
    return this.service.list(user, { status, branchId });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequiresPermission('club.subscriptions.freeze_requests:update', 'club.subscriptions.list:update')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequiresPermission('club.subscriptions.freeze_requests:update', 'club.subscriptions.list:update')
  reject(@Param('id', ParseIntPipe) id: number, @Body('note') note: string | undefined, @CurrentUser() user: JwtUser) {
    return this.service.reject(id, note, user);
  }
}

/** The member app posts its existing freeze form here. */
@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller()
export class MemberFreezeRequestsController {
  constructor(private readonly service: FreezeRequestsService) {}

  @Post('add_stopped_subs')
  @HttpCode(200)
  create(@CurrentMember() member: MemberJwtUser, @Body() body: Record<string, unknown>) {
    return this.service.createFromApp(member, body);
  }
}
