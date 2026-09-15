import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollController } from './payroll.controller';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollService } from './payroll.service';

@Module({
  imports: [AccountingModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollEngineService],
  exports: [PayrollService],
})
export class PayrollModule {}
