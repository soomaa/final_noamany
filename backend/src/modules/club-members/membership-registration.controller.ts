import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { MembershipRegistrationService } from './membership-registration.service';

@UseGuards(JwtAuthGuard)
@Controller('club-membership-registration')
@RequiresPermission('club.membership_add:create')
export class MembershipRegistrationController {
  constructor(private readonly service: MembershipRegistrationService) {}
  @Get('sales') sales(@CurrentUser() user: JwtUser) { return this.service.sales(user); }
  @Get('types') types(@CurrentUser() user: JwtUser) { return this.service.packageOptions(user); }
  @Get('members') search(@Query('search') search: string | undefined, @CurrentUser() user: JwtUser, @Query('branchId', new ParseIntPipe({ optional: true })) branchId?: number) { return this.service.search(search, user, branchId); }
  @Get('members/:id') findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.service.findOne(id, user); }
}
