import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { TrainerPortalService } from './trainer-portal.service';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

@UseGuards(JwtAuthGuard)
@Controller('trainer-portal')
@RequiresPermission('trainer.portal:view')
export class TrainerPortalController {
  constructor(private readonly service: TrainerPortalService) {}

  @Get('schedule')
  schedule(
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.schedule(user, { dateFrom, dateTo });
  }

  @Get('dashboard')
  dashboard(
    @CurrentUser() user: JwtUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.dashboard(user, { dateFrom, dateTo });
  }

  @Get('private-clients')
  privateClients(@CurrentUser() user: JwtUser) {
    return this.service.privateClients(user);
  }

  @Post('private-clients/:subscriptionId/check-in')
  privateCheckIn(@CurrentUser() user: JwtUser, @Param('subscriptionId', ParseIntPipe) subscriptionId: number) {
    return this.service.privateCheckIn(user, subscriptionId);
  }
}
