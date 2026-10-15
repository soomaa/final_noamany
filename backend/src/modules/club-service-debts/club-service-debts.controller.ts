import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubServiceDebtsService } from './club-service-debts.service';
import { ListClubServiceDebtsDto, PayClubServiceDebtDto } from './dto/club-service-debts.dto';

@Controller('club-service-debts')
@RequiresPermission(
  'club.subscriptions.outstanding:view',
  'club.subscriptions.list:view',
  'club.reception:view',
)
export class ClubServiceDebtsController {
  constructor(private readonly service: ClubServiceDebtsService) {}
  @Get() list(@Query() query: ListClubServiceDebtsDto, @CurrentUser() user: JwtUser) { return this.service.list(query, user); }
  @Post(':id/pay')
  @RequiresPermission(
    'club.subscriptions.outstanding:update',
    'club.subscriptions.list:update',
    'club.reception:update',
  )
  pay(@Param('id', ParseIntPipe) id: number, @Body() body: PayClubServiceDebtDto, @CurrentUser() user: JwtUser) { return this.service.pay(id, body, user); }
}
