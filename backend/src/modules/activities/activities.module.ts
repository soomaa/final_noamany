import { Module } from '@nestjs/common';
import { HrDataScopeModule } from '../../common/hr-scope/hr-data-scope.module';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  imports: [HrDataScopeModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
