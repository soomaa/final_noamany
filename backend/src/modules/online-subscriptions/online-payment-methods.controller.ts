import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { OnlineSubscriptionsService } from './online-subscriptions.service';

@UseGuards(JwtAuthGuard)
@Controller('portal/payment-methods')
export class OnlinePaymentMethodsController {
  constructor(private readonly service: OnlineSubscriptionsService) {}
  @Get() @RequiresPermission('portal.payment-methods:view') list(@CurrentUser() user: JwtUser) { return this.service.adminPaymentMethods(user); }
  @Get('options') @RequiresPermission('portal.payment-methods:view') options(@CurrentUser() user: JwtUser) { return this.service.adminBranchOptions(user); }
  @Post() @RequiresPermission('portal.payment-methods:update') create(@CurrentUser() user: JwtUser, @Body() body: Record<string, unknown>) { return this.service.savePaymentMethod(user, body); }
  @Put(':id') @RequiresPermission('portal.payment-methods:update') update(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) { return this.service.savePaymentMethod(user, body, id); }
}
