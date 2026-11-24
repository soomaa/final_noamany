import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { LeavesController } from './leaves.controller';
import { LeavesCron } from './leaves.cron';
import { LeavesService } from './leaves.service';

@Module({
  imports: [PushModule],
  controllers: [LeavesController],
  providers: [LeavesService, LeavesCron],
  exports: [LeavesService],
})
export class LeavesModule {}
