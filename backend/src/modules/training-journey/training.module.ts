import { Module } from "@nestjs/common";
import {
  TrainingAdminController,
  TrainerTrainingController,
  TrainingMemberController,
} from "./training.controller";
import {
  MemberRecordingsController,
  PublicRecordingsController,
  TrainerRecordingsController,
  TrainingRecordingsAdminController,
} from "./training-recordings.controller";
import { TrainingRecordingsService } from "./training-recordings.service";
import { TrainerTrainingGuard } from "./trainer-training.guard";
import { TrainingService } from "./training.service";
@Module({
  controllers: [
    TrainingAdminController,
    TrainingMemberController,
    TrainerTrainingController,
    TrainingRecordingsAdminController,
    TrainerRecordingsController,
    MemberRecordingsController,
    PublicRecordingsController,
  ],
  providers: [TrainingService, TrainerTrainingGuard, TrainingRecordingsService],
  exports: [TrainingService],
})
export class TrainingJourneyModule {}
