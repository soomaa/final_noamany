import { Module } from '@nestjs/common';
import { HrDataScopeModule } from '../../common/hr-scope/hr-data-scope.module';
import { SiteVisitsController } from './site-visits.controller';
import { SiteVisitsService } from './site-visits.service';

@Module({
  imports: [HrDataScopeModule],
  controllers: [SiteVisitsController],
  providers: [SiteVisitsService],
})
export class SiteVisitsModule {}
