import { Module } from '@nestjs/common';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { EmployeesModule } from '../employees/employees.module';
import { ClubAttendanceController } from './club-attendance.controller';
import { ClubAttendanceCron } from './club-attendance.cron';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubMemberGroupsController, ClubSurveysController } from './club-extras.controller';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembershipTypesController } from './club-membership-types.controller';
import { ClubMembershipTypesService } from './club-membership-types.service';
import { ClubLeadsController } from './club-leads.controller';
import { ClubLeadsService } from './club-leads.service';
import { MemberDocumentStorageService } from './member-document-storage.service';

@Module({
  imports: [GymOpsModule, ClubSubscriptionsModule, EmployeesModule],
  controllers: [ClubMembersController, ClubMembershipTypesController, ClubAttendanceController, ClubMemberGroupsController, ClubSurveysController, ClubLeadsController],
  providers: [ClubMembersService, ClubMembershipTypesService, ClubAttendanceService, ClubAttendanceCron, ClubLeadsService, MemberDocumentStorageService],
  exports: [ClubMembersService],
})
export class ClubMembersModule {}
