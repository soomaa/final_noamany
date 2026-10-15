import { Module } from '@nestjs/common';
import { WeeklyLeavesController } from './weekly-leaves.controller';
import { WeeklyLeavesService } from './weekly-leaves.service';

@Module({
  controllers: [WeeklyLeavesController],
  providers: [WeeklyLeavesService],
})
export class WeeklyLeavesModule {}
