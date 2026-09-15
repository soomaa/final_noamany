import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubReceiptsController } from './club-receipts.controller';
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionRefundsController } from './club-subscription-refunds.controller';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';
import { ClubSubscriptionStatusCron } from './club-subscription-status.cron';
import { ClubSubscriptionTransfersController } from './club-subscription-transfers.controller';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';
import { ClubSubscriptionTypesController } from './club-subscription-types.controller';
import { ClubSubscriptionTypesService } from './club-subscription-types.service';
import { ClubSubscriptionsController } from './club-subscriptions.controller';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { SubscriptionReportsService } from './subscription-reports.service';
import { PrivateSubscriptionsController } from './private-subscriptions.controller';
import { PrivateSubscriptionsService } from './private-subscriptions.service';
import { ClubDiscountCodesModule } from './club-discount-codes.module';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';
import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';

@Module({
  imports: [AccountingModule, GymOpsModule, ClubDiscountCodesModule],
  controllers: [
    ClubSubscriptionsController,
    ClubSubscriptionTypesController,
    ClubSubscriptionRefundsController,
    ClubSubscriptionTransfersController,
    ClubReceiptsController,
    PrivateSubscriptionsController,
  ],
  providers: [
    ClubSubscriptionsService,
    SubscriptionReportsService,
    ClubSubscriptionTypesService,
    ClubSubscriptionRefundsService,
    ClubSubscriptionTransfersService,
    ClubReceiptsService,
    ClubReceiptsCrudService,
    ClubSubscriptionAccountingService,
    ClubSubscriptionStatusCron,
    PrivateSubscriptionsService,
    ClubSubscriptionLifecycleService,
    ClubSubscriptionRenewalService,
  ],
  exports: [
    ClubSubscriptionsService,
    ClubReceiptsService,
    ClubSubscriptionAccountingService,
    ClubReceiptsCrudService,
    ClubSubscriptionRefundsService,
    ClubSubscriptionLifecycleService,
    ClubSubscriptionRenewalService,
  ],
})
export class ClubSubscriptionsModule {}
