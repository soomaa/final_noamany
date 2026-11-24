import { Module } from '@nestjs/common';
import { PeriodSummaryController } from './period-summary.controller';
import { PeriodSummaryService } from './period-summary.service';

@Module({
  controllers: [PeriodSummaryController],
  providers: [PeriodSummaryService],
})
export class PeriodSummaryModule {}
