import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AccountsController, AccountingPeriodsController, AccountingSettingsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountingReportsController } from './accounting-reports.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { JournalEntriesController } from './journal-entries.controller';
import { JournalEntriesService } from './journal-entries.service';
import { LedgerService } from './ledger.service';
import { ModuleLedgerService } from './module-ledger.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    AccountsController,
    AccountingSettingsController,
    AccountingPeriodsController,
    JournalEntriesController,
    AccountingReportsController,
  ],
  providers: [
    AccountsService,
    JournalEntriesService,
    AccountingReportsService,
    LedgerService,
    ModuleLedgerService,
  ],
  exports: [LedgerService, AccountsService, ModuleLedgerService, AccountingReportsService],
})
export class AccountingModule {}
