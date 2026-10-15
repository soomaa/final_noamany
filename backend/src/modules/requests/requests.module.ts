import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { BusinessAuditModule } from '../../common/audit/business-audit.module';
import { RequestEffectService } from './request-effect.service';
import { LeavesModule } from '../leaves/leaves.module';

@Module({
  imports: [BusinessAuditModule, LeavesModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestEffectService],
  exports: [RequestsService],
})
export class RequestsModule {}
