import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';
import { TransferSubscriptionToMemberDto } from './dto/transfer-subscription-to-member.dto';
import { TransferSubscriptionPlanDto } from './dto/transfer-subscription-plan.dto';

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

  @Get('member-transfers')
  listMemberTransfers(@CurrentUser() user: JwtUser) {
    return this.service.listMemberTransfers(user);
  }

  @Post('to-member')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  transferToMember(
    @Body() body: TransferSubscriptionToMemberDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.transferToMember(body, user);
  }

  @Post('preview')
  @RequiresPermission(
    'club.subscriptions:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  previewPlanTransfer(
    @Body() body: TransferSubscriptionPlanDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.previewPlanTransfer(body, user);
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
    @Body() body: TransferSubscriptionPlanDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(body, user);
  }
}
