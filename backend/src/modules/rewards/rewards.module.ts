import { Module } from '@nestjs/common';
import { HrDataScopeModule } from '../../common/hr-scope/hr-data-scope.module';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [HrDataScopeModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
