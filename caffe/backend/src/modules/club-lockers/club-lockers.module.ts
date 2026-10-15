import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import {
  ClubLockerSubscriptionsController,
  ClubLockersController,
  ClubLockerTypesController,
} from './club-lockers.controller';
import { ClubLockerAccountingService } from './club-locker-accounting.service';
import { ClubLockerStatusCron } from './club-locker-status.cron';
import { ClubLockersService } from './club-lockers.service';

@Module({
  imports: [AccountingModule],
  controllers: [ClubLockersController, ClubLockerTypesController, ClubLockerSubscriptionsController],
  providers: [ClubLockersService, ClubLockerAccountingService, ClubLockerStatusCron],
  exports: [ClubLockersService],
})
export class ClubLockersModule {}
