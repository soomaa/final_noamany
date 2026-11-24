import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
import { ClearanceController } from './clearance.controller';
import { ClearanceService } from './clearance.service';
import { ExitsController } from './exits.controller';
import { ExitsService } from './exits.service';

@Module({
  controllers: [ClearanceController, ArchiveController, ExitsController],
  providers: [ClearanceService, ArchiveService, ExitsService],
  exports: [ClearanceService, ArchiveService, ExitsService],
})
export class TerminationModule {}
