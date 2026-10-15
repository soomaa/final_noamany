import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';

@UseGuards(JwtAuthGuard)
@Controller('club-subscription-transfers')
@RequiresPermission(
  'club.subscriptions:view',
  'club.subscriptions.list:view',
  'club.reception:view',
)
export class ClubSubscriptionTransfersController {
  constructor(private readonly service: ClubSubscriptionTransfersService) {}

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get('member/:memberId/history')
  memberHistory(@Param('memberId', ParseIntPipe) memberId: number, @CurrentUser() user: JwtUser) {
    return this.service.memberHistory(memberId, user);
  }

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  create(
    @Body()
    body: {
      subscriptionId: number;
      toSubscriptionType: string;
      toStartDate: string;
      toEndDate: string;
      toValue: number;
      transferDate?: string;
      reason?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create({ ...body, createdBy: user.sub }, user);
  }
}
