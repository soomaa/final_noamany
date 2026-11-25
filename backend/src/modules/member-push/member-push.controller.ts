import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ListPushSendsDto,
  PushAudienceRequestDto,
  PushCampaignDto,
  PushSendDto,
  PushSettingsDto,
  PushTestDto,
} from './dto/member-push.dto';
import { MemberPushService } from './member-push.service';

/** «إشعارات الموبايل للأعضاء» — /api/app/push/... (RBAC page app-management.push). */
@UseGuards(JwtAuthGuard)
@Controller('app/push')
export class MemberPushController {
  constructor(private readonly service: MemberPushService) {}

  @Get('settings')
  @RequiresPermission('app-management.push:view')
  settings() {
    return this.service.settings();
  }

  @Put('settings')
  @RequiresPermission('app-management.push:update')
  updateSettings(@Body() dto: PushSettingsDto) {
    return this.service.updateSettings(dto);
  }

  /** Estimated members / devices and the delivery plan. Body: { audience, title?, body? }. */
  @Post('audience/preview')
  @HttpCode(200)
  @RequiresPermission('app-management.push:view')
  preview(@Body() dto: PushAudienceRequestDto & { title?: string; body?: string }) {
    return this.service.preview(dto.audience, dto);
  }

  @Post('send')
  @RequiresPermission('app-management.push:create')
  send(@Body() dto: PushSendDto, @CurrentUser('sub') userId: number) {
    return this.service.sendNow(dto, userId ?? null);
  }

  @Post('test')
  @HttpCode(200)
  @RequiresPermission('app-management.push:create')
  test(@Body() dto: PushTestDto, @CurrentUser('sub') userId: number) {
    return this.service.sendTest(dto, userId ?? null);
  }

  @Get('sends')
  @RequiresPermission('app-management.push:view')
  sends(@Query() q: ListPushSendsDto) {
    return this.service.listSends(q);
  }

  @Get('sends/:id')
  @RequiresPermission('app-management.push:view')
  send_(@Param('id', ParseIntPipe) id: number) {
    return this.service.getSend(id);
  }

  @Get('campaigns')
  @RequiresPermission('app-management.push:view')
  campaigns() {
    return this.service.listCampaigns();
  }

  @Post('campaigns')
  @RequiresPermission('app-management.push:create')
  createCampaign(@Body() dto: PushCampaignDto, @CurrentUser('sub') userId: number) {
    return this.service.createCampaign(dto, userId ?? null);
  }

  @Put('campaigns/:id')
  @RequiresPermission('app-management.push:update')
  updateCampaign(@Param('id', ParseIntPipe) id: number, @Body() dto: PushCampaignDto) {
    return this.service.updateCampaign(id, dto);
  }

  @Post('campaigns/:id/pause')
  @HttpCode(200)
  @RequiresPermission('app-management.push:update')
  pause(@Param('id', ParseIntPipe) id: number) {
    return this.service.setCampaignStatus(id, 'pause');
  }

  @Post('campaigns/:id/resume')
  @HttpCode(200)
  @RequiresPermission('app-management.push:update')
  resume(@Param('id', ParseIntPipe) id: number) {
    return this.service.setCampaignStatus(id, 'resume');
  }

  @Post('campaigns/:id/duplicate')
  @RequiresPermission('app-management.push:create')
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.service.duplicateCampaign(id, userId ?? null);
  }

  @Delete('campaigns/:id')
  @RequiresPermission('app-management.push:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteCampaign(id);
  }
}
