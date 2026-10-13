import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';
import { UpdateClubSubscriptionRefundDto } from './dto/update-club-subscription-refund.dto';
import { ClubGroupOperation } from '../../common/branch-groups/club-operation-scope';

@UseGuards(JwtAuthGuard)
@Controller('club-subscription-refunds')
@ClubGroupOperation()
@RequiresPermission(
  'club.subscriptions.refunds:view',
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

  @Patch(':id')
  @RequiresPermission('club.subscriptions:update', 'club.subscriptions.list:update', 'club.reception:update')
  edit(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateClubSubscriptionRefundDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.edit(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete', 'club.subscriptions.list:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post()
  @RequiresPermission(
    'club.subscriptions.refunds:create',
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  create(
    @Body() body: { subscriptionId: number; stopDate: string; reason?: string; notes?: string; branchId?: number },
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
