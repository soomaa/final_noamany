import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { wa_devices } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateWaCampaignDto,
  CreateWaDeviceDto,
  ListWaCampaignsDto,
  ListWaMessagesDto,
  UpsertWaTemplateDto,
  WaAbsenceLookupDto,
  WaCommitmentLookupDto,
  WaAbsenceSettingsDto,
  WaAudienceDto,
  WaBirthdaySettingsDto,
  WaNextDto,
  WaOptOutDto,
  WaPairDto,
  WaResultDto,
  WaStopReplyDto,
} from './dto/wa-campaigns.dto';
import { sha256, WaCampaignsService } from './wa-campaigns.service';
import { WaBirthdaysService } from './wa-birthdays.service';
import { WaExtService } from './wa-ext.service';

@UseGuards(JwtAuthGuard)
@Controller('wa-campaigns')
@RequiresPermission('club.whatsapp:view')
export class WaCampaignsController {
  constructor(
    private readonly wa: WaCampaignsService,
    private readonly birthdays: WaBirthdaysService,
  ) {}

  @Get('control') control() { return this.wa.controlStatus(); }

  @Get('birthdays') birthdaySettings(@CurrentUser() user: JwtUser) { return this.birthdays.settings(user); }
  @Patch('birthdays') @RequiresPermission('club.whatsapp:configure')
  updateBirthdays(@Body() dto: WaBirthdaySettingsDto, @CurrentUser() user: JwtUser) { return this.birthdays.updateSettings(dto, user); }
  @Post('birthdays/run') @HttpCode(200) @RequiresPermission('club.whatsapp:configure')
  runBirthdays(@CurrentUser() user: JwtUser) { return this.birthdays.runToday('manual', user.sub); }

  @Get('absence-settings') absenceSettings() { return this.wa.absenceSettings(); }
  @Patch('absence-settings') @RequiresPermission('club.whatsapp:configure')
  updateAbsenceSettings(@Body() dto: WaAbsenceSettingsDto) { return this.wa.updateAbsenceSettings(dto); }

  @Get('templates') templates() { return this.wa.listTemplates(); }
  @Post('templates') @RequiresPermission('club.whatsapp:create')
  createTemplate(@Body() dto: UpsertWaTemplateDto, @CurrentUser() user: JwtUser) { return this.wa.createTemplate(dto, user); }
  @Patch('templates/:id') @RequiresPermission('club.whatsapp:update')
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertWaTemplateDto) { return this.wa.updateTemplate(id, dto); }
  @Delete('templates/:id')
  @RequiresPermission('club.whatsapp:delete')
  removeTemplate(@Param('id', ParseIntPipe) id: number) { return this.wa.removeTemplate(id); }

  @Get('devices') devices(@CurrentUser() user: JwtUser) { return this.wa.listDevices(user); }
  @Post('devices') @RequiresPermission('club.whatsapp:configure')
  createDevice(@Body() dto: CreateWaDeviceDto, @CurrentUser() user: JwtUser) { return this.wa.createDevice(dto, user); }
  @Post('devices/:id/pair-code') @RequiresPermission('club.whatsapp:configure')
  pairCode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) { return this.wa.newPairCode(id, user); }
  @Delete('devices/:id')
  @RequiresPermission('club.whatsapp:delete')
  revokeDevice(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtUser) { return this.wa.revokeDevice(id, user); }

  @Get('opt-outs') optOuts() { return this.wa.listOptOuts(); }
  @Post('opt-outs') @RequiresPermission('club.whatsapp:configure')
  addOptOut(@Body() dto: WaOptOutDto, @CurrentUser() user: JwtUser) { return this.wa.addOptOut(dto, user); }
  @Delete('opt-outs/:phone')
  @RequiresPermission('club.whatsapp:delete')
  removeOptOut(@Param('phone') phone: string) { return this.wa.removeOptOut(phone); }

  @Post('preview') @HttpCode(200) @RequiresPermission('club.whatsapp:create')
  preview(@Body() dto: WaAudienceDto, @CurrentUser() user: JwtUser) { return this.wa.preview(dto, user); }

  @Post('messages/:id/requeue') @RequiresPermission('club.whatsapp:update')
  requeue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.resolveMessage(id, 'requeue', user); }
  @Post('messages/:id/mark-sent') @RequiresPermission('club.whatsapp:update')
  markSent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.resolveMessage(id, 'mark-sent', user); }

  @Get() list(@Query() q: ListWaCampaignsDto, @CurrentUser() user: JwtUser) { return this.wa.listCampaigns(q, user); }
  @Post() @RequiresPermission('club.whatsapp:create')
  create(@Body() dto: CreateWaCampaignDto, @CurrentUser() user: JwtUser) { return this.wa.createCampaign(dto, user); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.getCampaign(id, user); }
  @Get(':id/messages')
  messages(@Param('id', ParseIntPipe) id: number, @Query() q: ListWaMessagesDto, @CurrentUser() user: JwtUser) { return this.wa.listMessages(id, q, user); }
  @Post(':id/start') @RequiresPermission('club.whatsapp:update')
  start(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.setCampaignStatus(id, 'start', user); }
  @Post(':id/pause') @RequiresPermission('club.whatsapp:update')
  pause(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.setCampaignStatus(id, 'pause', user); }
  @Post(':id/cancel') @RequiresPermission('club.whatsapp:update')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.setCampaignStatus(id, 'cancel', user); }
  @Post(':id/retry-failed') @RequiresPermission('club.whatsapp:update')
  retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.wa.retryFailed(id, user); }
}

/**
 * «لم يحضر منذ مدة» on the attendance list: same permissions as reading that list, so reception
 * gets the colours and the WhatsApp button without access to the WhatsApp campaigns page.
 */
@UseGuards(JwtAuthGuard)
@Controller('wa-reminders')
@RequiresPermission('club.members:view', 'club.members.attendance:view', 'club.reception:view')
export class WaRemindersController {
  constructor(private readonly wa: WaCampaignsService) {}

  @Get('absence') absence(@Query() q: WaAbsenceLookupDto, @CurrentUser() user: JwtUser) { return this.wa.absenceLookup(q, user); }
  /** «عدم الالتزام بالحضور» text for the rows of the member commitment report. */
  @Get('commitment') commitment(@Query() q: WaCommitmentLookupDto, @CurrentUser() user: JwtUser) { return this.wa.commitmentLookup(q, user); }
}

/** `Authorization: Bearer pwa_…` → request.waDevice (paired, not revoked). */
@Injectable()
export class WaDeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = /^Bearer (pwa_[A-Za-z0-9_-]{40,})$/.exec(request.headers?.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('الجهاز مش مربوط');
    const device = await this.prisma.wa_devices.findUnique({ where: { token_hash: sha256(token) } });
    if (!device || device.revoked_at) throw new UnauthorizedException('الجهاز اتلغى أو اتربط من جديد — اربطه تاني');
    request.waDevice = device;
    return true;
  }
}

const waDevice = (req: Request) => (req as Request & { waDevice: wa_devices }).waDevice;

/** /api/wa-ext — the Chrome extension running inside web.whatsapp.com. */
@Public()
@Controller('wa-ext')
export class WaExtController {
  constructor(private readonly ext: WaExtService) {}

  @Post('pair') @HttpCode(200) @UseGuards(ThrottlerGuard) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pair(@Body() dto: WaPairDto) { return this.ext.pair(dto.code); }

  @Get('state') @UseGuards(WaDeviceGuard) state(@Req() req: Request) { return this.ext.state(waDevice(req)); }
  @Post('next') @HttpCode(200) @UseGuards(WaDeviceGuard)
  next(@Req() req: Request, @Body() dto: WaNextDto) { return this.ext.next(waDevice(req), dto.campaignId); }
  @Post('messages/:id/result') @HttpCode(200) @UseGuards(WaDeviceGuard)
  result(@Req() req: Request, @Param('id', ParseIntPipe) id: number, @Body() dto: WaResultDto) { return this.ext.result(waDevice(req), id, dto.status, dto.reason); }
  @Post('release') @HttpCode(200) @UseGuards(WaDeviceGuard) release(@Req() req: Request) { return this.ext.release(waDevice(req)); }
  @Post('stop-reply') @HttpCode(200) @UseGuards(WaDeviceGuard)
  stopReply(@Req() req: Request, @Body() dto: WaStopReplyDto) { return this.ext.stopReply(waDevice(req), dto.phone, dto.text); }
}
