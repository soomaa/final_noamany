import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ClubDashboardModule } from '../club-dashboard/club-dashboard.module';

@Module({
  imports: [ClubDashboardModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
