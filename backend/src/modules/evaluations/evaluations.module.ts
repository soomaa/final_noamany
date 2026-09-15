import { Module } from '@nestjs/common';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { EvaluationWorkflowService } from './evaluation-workflow.service';

@Module({
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvaluationWorkflowService],
  exports: [EvaluationsService, EvaluationWorkflowService],
})
export class EvaluationsModule {}
