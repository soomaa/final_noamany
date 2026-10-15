import { Module } from '@nestjs/common';
import { ClubDashboardController } from './club-dashboard.controller';
import { ClubDashboardService } from './club-dashboard.service';

@Module({
  controllers: [ClubDashboardController],
  providers: [ClubDashboardService],
  exports: [ClubDashboardService],
})
export class ClubDashboardModule {}
