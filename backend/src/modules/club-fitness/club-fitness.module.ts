import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubClassesController } from './club-classes.controller';
import { ClubClassesService } from './club-classes.service';
import {
  ClubEquipmentController,
  ClubEquipmentMaintenanceController,
  ClubFacilitiesController,
} from './club-facilities.controller';
import { ClubFacilitiesService } from './club-facilities.service';
import { ClubFitnessLedgerService } from './club-fitness-ledger.service';
import { ClubHallBookingsController, ClubHallsController } from './club-halls.controller';
import { ClubHallsService } from './club-halls.service';
import { ClubTrainerSalariesController } from './club-trainer-salaries.controller';
import { ClubTrainersController } from './club-trainers.controller';
import { ClubTrainersService } from './club-trainers.service';
import {
  ClubExercisesController,
  ClubMemberProgressController,
  ClubPhysicalAssessmentsController,
  ClubWorkoutProgramsController,
  ClubWorkoutTemplatesController,
} from './club-workouts.controller';
import { ClubWorkoutsService } from './club-workouts.service';
import {
  AdminInbodyController,
  ClubInbodyInvoicesController,
  ClubInbodyMeasurementsController,
  ClubInbodyServicesController,
  ClubSpaAttendanceController,
  ClubSpaBookingsController,
  ClubSpaInvoicesController,
  ClubSpaServicesController,
} from './club-wellness.controller';
import { ClubWellnessService } from './club-wellness.service';
import { ClubClassStatusCron } from './club-class-status.cron';
import { ClubClassTypesController } from './club-class-types.controller';
import { ClubClassTypesService } from './club-class-types.service';
import { TrainerPortalController } from './trainer-portal.controller';
import { TrainerPortalService } from './trainer-portal.service';
import { ClubTrainerTargetPeriodsService } from './club-trainer-target-periods.service';

@Module({
  imports: [GymOpsModule, AccountingModule],
  controllers: [
    ClubTrainersController,
    TrainerPortalController,
    ClubTrainerSalariesController,
    ClubClassesController,
    ClubClassTypesController,
    ClubHallsController,
    ClubHallBookingsController,
    ClubExercisesController,
    ClubWorkoutProgramsController,
    ClubWorkoutTemplatesController,
    ClubMemberProgressController,
    ClubPhysicalAssessmentsController,
    ClubInbodyMeasurementsController,
    AdminInbodyController,
    ClubInbodyInvoicesController,
    ClubInbodyServicesController,
    ClubSpaServicesController,
    ClubSpaBookingsController,
    ClubSpaAttendanceController,
    ClubSpaInvoicesController,
    ClubFacilitiesController,
    ClubEquipmentController,
    ClubEquipmentMaintenanceController,
  ],
  providers: [
    ClubTrainersService,
    TrainerPortalService,
    ClubClassesService,
    ClubClassTypesService,
    ClubHallsService,
    ClubWorkoutsService,
    ClubWellnessService,
    ClubFacilitiesService,
    ClubFitnessLedgerService,
    ClubClassStatusCron,
    ClubTrainerTargetPeriodsService,
  ],
  exports: [ClubTrainersService, ClubClassesService, ClubHallsService],
})
export class ClubFitnessModule {}
