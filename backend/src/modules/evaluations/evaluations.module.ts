import { Module } from '@nestjs/common';
import { HrDataScopeModule } from '../../common/hr-scope/hr-data-scope.module';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [HrDataScopeModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
