import { Module } from '@nestjs/common';
import { HrDataScopeModule } from '../../common/hr-scope/hr-data-scope.module';
import { PenaltiesController } from './penalties.controller';
import { PenaltiesService } from './penalties.service';

@Module({
  imports: [HrDataScopeModule],
  controllers: [PenaltiesController],
  providers: [PenaltiesService],
  exports: [PenaltiesService],
})
export class PenaltiesModule {}
