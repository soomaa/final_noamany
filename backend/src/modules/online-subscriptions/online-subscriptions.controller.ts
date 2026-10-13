import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { OnlineSubscriptionsService } from './online-subscriptions.service';
@UseGuards(JwtAuthGuard) @Controller('online-subscriptions') export class OnlineSubscriptionsController { constructor(private readonly service:OnlineSubscriptionsService){} @Get() @RequiresPermission('club.subscriptions:view') list(@CurrentUser() user:JwtUser){return this.service.list(user)} @Post(':id/approve') @RequiresPermission('club.subscriptions:update') approve(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:JwtUser){return this.service.approve(id,user)} @Post(':id/reject') @RequiresPermission('club.subscriptions:update') reject(@Param('id',ParseIntPipe) id:number,@Body('reason') reason:string,@CurrentUser() user:JwtUser){return this.service.reject(id,user,reason)} }
