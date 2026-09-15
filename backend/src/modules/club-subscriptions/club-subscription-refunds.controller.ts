import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';

@UseGuards(JwtAuthGuard)
@Controller('club-subscription-refunds')
@RequiresPermission(
  'club.subscriptions:view',
  'club.subscriptions.list:view',
  'club.reception:view',
)
export class ClubSubscriptionRefundsController {
  constructor(private readonly service: ClubSubscriptionRefundsService) {}

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
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
    @Body() body: { subscriptionId: number; stopDate: string; reason?: string; notes?: string },
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.create({ ...body, createdBy: user.sub, dryRun: isDryRun(dryRun) }, user);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:approve')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'pending' | 'completed' | 'cancelled',
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateStatus(id, status, user.sub, user);
  }
}
