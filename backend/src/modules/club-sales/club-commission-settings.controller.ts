import { SystemOwnerOnly } from '../../common/guards/system-owner.guard';
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtUser } from '../../common/types/jwt-user';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { SalesDefaultsDto, UpsertSalesRepSettingsDto } from './dto/leads.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-sales-settings')
export class ClubCommissionSettingsController {
  constructor(private readonly service: ClubCommissionSettingsService) {}

  @Get('sales-defaults')
  @RequiresPermission('club.sales.settings:view')
  defaults() { return this.service.getSalesDefaults(); }

  @SystemOwnerOnly()
  @Put('sales-defaults')
  @RequiresPermission('club.sales.settings:configure')
  saveDefaults(@Body() body: SalesDefaultsDto) { return this.service.saveSalesDefaults(body); }

  @Get('sales-reps')
  @RequiresPermission('club.sales.settings:view')
  salesReps(@CurrentUser() user: JwtUser) {
    return this.service.listSalesRepsWithSettings(user);
  }

  @Put('sales-reps')
  @RequiresPermission('club.sales.settings:configure')
  upsertSales(@Body() body: UpsertSalesRepSettingsDto, @CurrentUser() user: JwtUser) {
    return this.service.upsertSalesRep(body, user);
  }
}
