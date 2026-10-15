import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { FinanceReportsController } from './finance-reports.controller';
import { FinanceReportsService } from './finance-reports.service';
import { RevenuesController } from './revenues.controller';
import { RevenuesService } from './revenues.service';

import { FinanceRecurringCron } from './finance-recurring.cron';

@Module({
  imports: [AccountingModule],
  controllers: [
    ExpensesController,
    ExpenseCategoriesController,
    RevenuesController,
    FinanceReportsController,
  ],
  providers: [
    ExpensesService,
    ExpenseCategoriesService,
    RevenuesService,
    FinanceReportsService,
    FinanceRecurringCron,
  ],
  exports: [ExpensesService, RevenuesService, FinanceReportsService],
})
export class FinanceModule {}
