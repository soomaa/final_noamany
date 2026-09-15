import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { OnlineProofStorageService } from './online-proof-storage.service';
import { OnlineSubscriptionsService } from './online-subscriptions.service';

@UseGuards(JwtAuthGuard)
@Controller('online-subscriptions')
export class OnlineSubscriptionsController {
  constructor(private readonly service: OnlineSubscriptionsService, private readonly proofs: OnlineProofStorageService) {}

  @Get() @RequiresPermission('club.subscriptions.online:view')
  list(@CurrentUser() user: JwtUser, @Query('status') status?: string, @Query('branchId') branchId?: string) { return this.service.adminList(user, status, branchId ? Number(branchId) : undefined); }
  @Get('options') @RequiresPermission('club.subscriptions.online:view')
  options(@CurrentUser() user: JwtUser) { return this.service.adminBranchOptions(user); }
  @Get(':id') @RequiresPermission('club.subscriptions.online:view')
  detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) { return this.service.adminDetail(user, id); }
  @Get(':id/proof') @RequiresPermission('club.subscriptions.online:view')
  async proof(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Res() response: Response) {
    const request = await this.service.adminProof(user, id); const file = this.proofs.read(request.path);
    response.setHeader('Content-Type', request.mime);
    response.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    response.setHeader('Cache-Control', 'private, no-store'); return response.send(file.buffer);
  }
  @Post(':id/reject') @RequiresPermission('club.subscriptions.online:approve')
  reject(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) { return this.service.reject(user, id, reason); }
  @Post(':id/approve') @RequiresPermission('club.subscriptions.online:approve')
  approve(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) { return this.service.approveAndPromote(user, id); }
}
