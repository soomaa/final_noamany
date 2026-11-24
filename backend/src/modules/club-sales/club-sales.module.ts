import { ClubMosModule } from '../club-mos/club-mos.module';
import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubCommissionSettingsController } from './club-commission-settings.controller';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { ClubLeadsController } from './club-leads.controller';
import { ClubLeadsService } from './club-leads.service';
import { ClubSalesDashboardController } from './club-sales-dashboard.controller';
import { ClubSalesDashboardService } from './club-sales-dashboard.service';
import { ClubSalesReportsController } from './club-sales-reports.controller';
import { ClubSalesReportsService } from './club-sales-reports.service';

@Module({
  imports: [GymOpsModule, EmployeesModule, ClubMosModule],
  controllers: [
    ClubLeadsController,
    ClubCommissionSettingsController,
    ClubSalesDashboardController,
    ClubSalesReportsController,
  ],
  providers: [
    ClubLeadsService,
    ClubCommissionSettingsService,
    ClubSalesDashboardService,
    ClubSalesReportsService,
  ],
  exports: [ClubLeadsService, ClubSalesReportsService],
})
export class ClubSalesModule {}
