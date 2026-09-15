import { Module } from '@nestjs/common';
import { ClubGymPoliciesService } from './club-gym-policies.service';
import { BusinessAuditService } from './business-audit.service';
import { EntitlementService } from './entitlement.service';
import { ClubSearchService } from './club-search.service';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationService } from './automation.service';
import { AutomationCron } from './automation.cron';
import { ClubOpsController } from './club-ops.controller';
import { MessagingProviderService } from './messaging-provider.service';
import { ClubCalendarService } from './club-calendar.service';
import { UnifiedTreasuryController } from './unified-treasury.controller';
import { UnifiedTreasuryService } from './unified-treasury.service';
import { ClubDashboardModule } from '../club-dashboard/club-dashboard.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [ClubDashboardModule, BranchesModule],
  controllers: [ClubOpsController, UnifiedTreasuryController],
  providers: [
    BusinessAuditService,
    ClubGymPoliciesService,
    EntitlementService,
    ClubSearchService,
    AutomationEngineService,
    AutomationService,
    AutomationCron,
    MessagingProviderService,
    ClubCalendarService,
    UnifiedTreasuryService,
  ],
  exports: [BusinessAuditService, ClubGymPoliciesService, EntitlementService, ClubSearchService, AutomationEngineService, MessagingProviderService, ClubCalendarService],
})
export class GymOpsModule {}
