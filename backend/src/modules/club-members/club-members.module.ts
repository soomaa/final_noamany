import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { MembershipRegistrationController } from './membership-registration.controller';
import { MembershipRegistrationService } from './membership-registration.service';
import { Module } from '@nestjs/common';
import { GateCredentialModule } from '../gate-access/gate-credential.module';
import { ClubLockersModule } from '../club-lockers/club-lockers.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubAttendanceController } from './club-attendance.controller';
import { ClubAttendanceCron } from './club-attendance.cron';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubMemberGroupsController, ClubSurveysController } from './club-extras.controller';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembershipTypesController } from './club-membership-types.controller';
import { ClubMembershipTypesService } from './club-membership-types.service';

@Module({
  imports: [ClubSubscriptionsModule, GymOpsModule, GateCredentialModule, ClubLockersModule],
  controllers: [MembershipRegistrationController, ClubMembersController, ClubMembershipTypesController, ClubAttendanceController, ClubMemberGroupsController, ClubSurveysController],
  providers: [MembershipRegistrationService, ClubMembersService, ClubMembershipTypesService, ClubAttendanceService, ClubAttendanceCron],
  exports: [ClubMembersService, ClubAttendanceService],
})
export class ClubMembersModule {}
