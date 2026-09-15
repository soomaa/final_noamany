import { Module } from '@nestjs/common';
import { LeavesController } from './leaves.controller';
import { LeavesCron } from './leaves.cron';
import { LeavesService } from './leaves.service';

@Module({
  controllers: [LeavesController],
  providers: [LeavesService, LeavesCron],
  exports: [LeavesService],
})
export class LeavesModule {}
