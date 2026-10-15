import { Module } from '@nestjs/common';
import { PayrollModule } from '../payroll/payroll.module';
import { FinancePayrollController } from './finance-payroll.controller';
import { FinancePayrollService } from './finance-payroll.service';

@Module({
  imports: [PayrollModule],
  controllers: [FinancePayrollController],
  providers: [FinancePayrollService],
  exports: [FinancePayrollService],
})
export class FinancePayrollModule {}
