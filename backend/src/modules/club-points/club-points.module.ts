import { Module } from '@nestjs/common';
import { ClubPointsController } from './club-points.controller';
import { ClubPointsService } from './club-points.service';

@Module({
  controllers: [ClubPointsController],
  providers: [ClubPointsService],
  exports: [ClubPointsService],
})
export class ClubPointsModule {}
