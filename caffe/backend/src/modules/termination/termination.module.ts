import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { ClearanceController } from './clearance.controller';
import { ClearanceService } from './clearance.service';

@Module({
  controllers: [ClearanceController, ArchiveController],
  providers: [ClearanceService, ArchiveService],
  exports: [ClearanceService, ArchiveService],
})
export class TerminationModule {}
