import { Module } from '@nestjs/common';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { EmployeesModule } from '../employees/employees.module';
import { ClubAttendanceController } from './club-attendance.controller';
import { ClubAttendanceCron } from './club-attendance.cron';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubReceptionInvitationsController } from './club-reception-invitations.controller';
import { ClubReceptionInvitationsService } from './club-reception-invitations.service';
import { ClubMemberGroupsController, ClubSurveysController } from './club-extras.controller';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembershipTypesController } from './club-membership-types.controller';
import { ClubMembershipTypesService } from './club-membership-types.service';
import { MemberDocumentStorageService } from './member-document-storage.service';
import { ClubPointsModule } from '../club-points/club-points.module';

@Module({
  imports: [GymOpsModule, ClubSubscriptionsModule, EmployeesModule, ClubPointsModule],
  controllers: [ClubMembersController, ClubMembershipTypesController, ClubAttendanceController, ClubMemberGroupsController, ClubSurveysController, ClubReceptionInvitationsController],
  providers: [ClubMembersService, ClubMembershipTypesService, ClubAttendanceService, ClubAttendanceCron, MemberDocumentStorageService, ClubReceptionInvitationsService],
  exports: [ClubMembersService],
})
export class ClubMembersModule {}
