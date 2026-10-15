import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubCommissionSettingsController } from './club-commission-settings.controller';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { ClubInvitationsController } from './club-invitations.controller';
import { ClubInvitationsService } from './club-invitations.service';
import { ClubLeadsController } from './club-leads.controller';
import { ClubLeadsService } from './club-leads.service';
import { ClubSalesDashboardController } from './club-sales-dashboard.controller';
import { ClubSalesDashboardService } from './club-sales-dashboard.service';
import { ClubSalesReportsController } from './club-sales-reports.controller';
import { ClubSalesReportsService } from './club-sales-reports.service';
import { ClubCallsLogController } from './club-calls-log.controller';
import { ClubCallsLogService } from './club-calls-log.service';

@Module({
  imports: [EmployeesModule, GymOpsModule],
  controllers: [
    ClubLeadsController,
    ClubInvitationsController,
    ClubCommissionSettingsController,
    ClubSalesDashboardController,
    ClubSalesReportsController,
    ClubCallsLogController,
  ],
  providers: [
    ClubLeadsService,
    ClubInvitationsService,
    ClubCommissionSettingsService,
    ClubSalesDashboardService,
    ClubSalesReportsService,
    ClubCallsLogService,
  ],
  exports: [ClubLeadsService, ClubInvitationsService, ClubSalesReportsService],
})
export class ClubSalesModule {}
