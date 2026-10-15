import { Module } from '@nestjs/common';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { ClubAttendanceController } from './club-attendance.controller';
import { ClubAttendanceCron } from './club-attendance.cron';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubMemberGroupsController, ClubSurveysController } from './club-extras.controller';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembershipTypesController } from './club-membership-types.controller';
import { ClubMembershipTypesService } from './club-membership-types.service';

@Module({
  imports: [GymOpsModule, ClubSubscriptionsModule],
  controllers: [ClubMembersController, ClubMembershipTypesController, ClubAttendanceController, ClubMemberGroupsController, ClubSurveysController],
  providers: [ClubMembersService, ClubMembershipTypesService, ClubAttendanceService, ClubAttendanceCron],
  exports: [ClubMembersService],
})
export class ClubMembersModule {}
