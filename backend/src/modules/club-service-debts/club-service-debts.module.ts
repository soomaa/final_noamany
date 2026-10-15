import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { ClubServiceDebtsController } from './club-service-debts.controller';
import { ClubServiceDebtsService } from './club-service-debts.service';

@Module({
  imports: [AccountingModule, ClubSubscriptionsModule],
  controllers: [ClubServiceDebtsController],
  providers: [ClubServiceDebtsService],
  exports: [ClubServiceDebtsService],
})
export class ClubServiceDebtsModule {}
