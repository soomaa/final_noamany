import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { SetSalesRepActiveDto, UpsertSalesDefaultsDto, UpsertSalesRepSettingsDto, UpsertTrainerCommissionDto } from './dto/leads.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-sales-settings')
export class ClubCommissionSettingsController {
  constructor(private readonly service: ClubCommissionSettingsService) {}

  @Get('sales-reps')
  @RequiresPermission('club.sales.settings:view')
  salesReps() {
    return this.service.listSalesRepsWithSettings();
  }

  @Put('sales-reps')
  @RequiresPermission('club.sales.settings:configure')
  upsertSales(@Body() body: UpsertSalesRepSettingsDto) {
    return this.service.upsertSalesRep(body);
  }

  @Get('sales-defaults')
  @RequiresPermission('club.sales.settings:view')
  salesDefaults() {
    return this.service.getSalesDefaults();
  }

  @Put('sales-defaults')
  @RequiresPermission('club.sales.settings:configure')
  upsertSalesDefaults(@Body() body: UpsertSalesDefaultsDto) {
    return this.service.upsertSalesDefaults(body);
  }

  @Get('sales-reps/:id/deactivation-preview')
  @RequiresPermission('club.sales.settings:view')
  deactivationPreview(@Param('id', ParseIntPipe) id: number, @Query('today') today?: string) {
    return this.service.previewSalesRepDeactivation(id, today);
  }

  @Put('sales-reps/:id/active')
  @RequiresPermission('club.sales.settings:configure')
  setSalesRepActive(@Param('id', ParseIntPipe) id: number, @Body() body: SetSalesRepActiveDto) {
    return this.service.setSalesRepActive(id, body.isActive, body.transferToId);
  }

  @Get('trainers')
  @RequiresPermission('club.sales.settings:view', 'club.fitness.trainer_settings:view')
  trainers() {
    return this.service.listTrainersWithSettings();
  }

  @Put('trainers')
  @RequiresPermission('club.sales.settings:configure', 'club.fitness.trainer_settings:configure')
  upsertTrainer(@Body() body: UpsertTrainerCommissionDto) {
    return this.service.upsertTrainer(body);
  }
}
