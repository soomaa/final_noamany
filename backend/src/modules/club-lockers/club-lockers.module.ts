import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import {
  ClubLockerSubscriptionsController,
  ClubLockersController,
  ClubLockerTypesController,
  LockerInventoryController,
} from './club-lockers.controller';
import { ClubLockerAccountingService } from './club-locker-accounting.service';
import { ClubLockerStatusCron } from './club-locker-status.cron';
import { ClubLockersService } from './club-lockers.service';
import { LockerInventoryService } from './locker-inventory.service';

@Module({
  imports: [AccountingModule],
  controllers: [ClubLockersController, ClubLockerTypesController, ClubLockerSubscriptionsController, LockerInventoryController],
  providers: [ClubLockersService, ClubLockerAccountingService, ClubLockerStatusCron, LockerInventoryService],
  exports: [ClubLockersService],
})
export class ClubLockersModule {}
