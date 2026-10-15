import { Global, Module } from '@nestjs/common';
import { BusinessAuditService } from './business-audit.service';
import { BusinessAuditController } from './business-audit.controller';

@Global()
@Module({
  controllers: [BusinessAuditController],
  providers: [BusinessAuditService],
  exports: [BusinessAuditService],
})
export class BusinessAuditModule {}
