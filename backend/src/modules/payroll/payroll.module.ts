import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollService } from './payroll.service';
import { PayrollTaxPolicyService } from './payroll-tax-policy.service';
import { FinalSettlementPolicyService } from './final-settlement-policy.service';
import { FinalSettlementService } from './final-settlement.service';
import { BusinessAuditModule } from '../../common/audit/business-audit.module';

@Module({
  imports: [BusinessAuditModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollEngineService, PayrollTaxPolicyService, FinalSettlementPolicyService, FinalSettlementService],
  exports: [PayrollService],
})
export class PayrollModule {}
