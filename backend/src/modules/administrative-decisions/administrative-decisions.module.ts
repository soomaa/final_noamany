import { Module } from '@nestjs/common';
import { AdministrativeDecisionsController } from './administrative-decisions.controller';
import { AdministrativeDecisionsService } from './administrative-decisions.service';

@Module({
  controllers: [AdministrativeDecisionsController],
  providers: [AdministrativeDecisionsService],
  exports: [AdministrativeDecisionsService],
})
export class AdministrativeDecisionsModule {}
