import { Module } from "@nestjs/common";
import {
  TrainingAdminController,
  TrainerTrainingController,
  TrainingMemberController,
} from "./training.controller";
import { TrainerTrainingGuard } from "./trainer-training.guard";
import { TrainingService } from "./training.service";
@Module({
  controllers: [TrainingAdminController, TrainingMemberController, TrainerTrainingController],
  providers: [TrainingService, TrainerTrainingGuard],
  exports: [TrainingService],
})
export class TrainingJourneyModule {}
