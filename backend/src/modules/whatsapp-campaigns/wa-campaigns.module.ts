import { Module } from '@nestjs/common';
import { WaCampaignsController, WaDeviceGuard, WaExtController } from './wa-campaigns.controller';
import { WaBirthdaysService } from './wa-birthdays.service';
import { WaCampaignsService } from './wa-campaigns.service';
import { WaControlClient } from './wa-control.client';
import { WaControlService } from './wa-control/wa-control.service';
import { WaExtService } from './wa-ext.service';

/** WhatsApp Web campaigns: staff queue + the paired Chrome extension that sends them. */
@Module({
  controllers: [WaCampaignsController, WaExtController],
  providers: [WaCampaignsService, WaBirthdaysService, WaExtService, WaControlClient, WaControlService, WaDeviceGuard],
})
export class WaCampaignsModule {}
