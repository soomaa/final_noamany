import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubMembersModule } from '../club-members/club-members.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { RbacModule } from '../rbac/rbac.module';
import { ClubEventCategoriesController } from './club-event-categories.controller';
import { ClubEventCategoriesService } from './club-event-categories.service';
import { ClubEventsController } from './club-events.controller';
import { ClubEventsService } from './club-events.service';
import { ClubEventSessionsController } from './club-event-sessions.controller';
import { ClubEventSessionsService } from './club-event-sessions.service';
import { ClubEventRegistrationsController } from './club-event-registrations.controller';
import { ClubEventRegistrationsService } from './club-event-registrations.service';
import { ClubEventCheckinController } from './club-event-checkin.controller';
import { ClubEventCheckinService } from './club-event-checkin.service';
import { ClubEventSettingsController } from './club-event-settings.controller';
import { ClubEventSettingsService } from './club-event-settings.service';
import { ClubEventLiveController } from './club-event-live.controller';
import {
  ClubEventDisplaySettingsService,
  ClubEventLiveCheckinService,
  ClubEventProgramSegmentsService,
} from './club-event-live.service';

@Module({
  imports: [AccountingModule, ClubMembersModule, GymOpsModule, RbacModule],
  controllers: [
    ClubEventCategoriesController,
    ClubEventsController,
    ClubEventSessionsController,
    ClubEventRegistrationsController,
    ClubEventCheckinController,
    ClubEventSettingsController,
    ClubEventLiveController,
  ],
  providers: [
    ClubEventCategoriesService,
    ClubEventsService,
    ClubEventSessionsService,
    ClubEventRegistrationsService,
    ClubEventCheckinService,
    ClubEventSettingsService,
    ClubEventDisplaySettingsService,
    ClubEventProgramSegmentsService,
    ClubEventLiveCheckinService,
  ],
  exports: [ClubEventsService, ClubEventRegistrationsService],
})
export class ClubEventsModule {}
