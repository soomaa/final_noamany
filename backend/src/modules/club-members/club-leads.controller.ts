import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubLeadsService } from './club-leads.service';
@UseGuards(JwtAuthGuard) @Controller('club-leads')
export class ClubLeadsController { constructor(private readonly service: ClubLeadsService) {}
  @Get('mine') @RequiresPermission('sales.portal:view') mine(@CurrentUser() u: JwtUser, @Query() q: Record<string, unknown>) { return this.service.mine(u, q); }
  @Get('reminders') @RequiresPermission('sales.portal:view') reminders(@CurrentUser() u: JwtUser, @Query() q: Record<string, unknown>) { return this.service.reminders(u, q); }
  @Post('renewal/:memberId/ensure') @RequiresPermission('sales.portal:update') ensureRenewal(@Param('memberId', ParseIntPipe) memberId: number, @CurrentUser() u: JwtUser) { return this.service.ensureRenewalLead(memberId, u); }
  @Get(':id') @RequiresPermission('sales.portal:view') findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: JwtUser) { return this.service.findOne(id, u); }
  @Post(':id/reminders/complete') @RequiresPermission('sales.portal:update') complete(@Param('id', ParseIntPipe) id: number, @Body() b: Record<string, unknown>, @CurrentUser() u: JwtUser) { return this.service.completeReminder(id, b, u); }
  @Post(':id/follow-up') @RequiresPermission('sales.portal:update') follow(@Param('id', ParseIntPipe) id: number, @Body() b: Record<string, unknown>, @CurrentUser() u: JwtUser) { return this.service.followUp(id, b, u); }
}
