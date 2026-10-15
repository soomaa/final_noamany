import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubCallsLogService } from './club-calls-log.service';

@UseGuards(JwtAuthGuard)
@Controller('club-sales/calls-log')
export class ClubCallsLogController {
  constructor(private readonly service: ClubCallsLogService) {}

  @Get()
  @RequiresPermission('sales.portal:view', 'club.leads:view')
  list(
    @CurrentUser() user: JwtUser,
    @Query('search') search?: string,
    @Query('branchId') branchId?: string,
    @Query('answered') answered?: string,
  ) {
    return this.service.list(user, { search, branchId, answered });
  }
}
