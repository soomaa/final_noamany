import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ClubSalesModule } from '../club-sales/club-sales.module';
import { AppManagementController } from './app-management.controller';
import { AppManagementService } from './app-management.service';
import { AppManagementExpiryCron } from './app-management-expiry.cron';
import { InvitationPhonePolicyService } from '../../common/invitations/invitation-phone-policy.service';
import { GuestExperienceController, GuestLeadsController } from './guest-experience.controller';
import { GuestExperienceService } from './guest-experience.service';

@Module({
  imports: [PrismaModule, ClubSalesModule],
  controllers: [AppManagementController, GuestExperienceController, GuestLeadsController],
  providers: [
    AppManagementService,
    AppManagementExpiryCron,
    InvitationPhonePolicyService,
    GuestExperienceService,
  ],
  exports: [AppManagementService, InvitationPhonePolicyService],
})
export class AppManagementModule {}
