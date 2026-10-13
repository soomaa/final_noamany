import { Module } from '@nestjs/common';
import { EvaluationManagementController } from './evaluation-management.controller';
import { EvaluationManagementService } from './evaluation-management.service';

@Module({ controllers: [EvaluationManagementController], providers: [EvaluationManagementService] })
export class EvaluationManagementModule {}
