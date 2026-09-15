import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BranchScopeModule } from '../../common/branch-scope/branch-scope.module';
import { OnlineSubscriptionsService } from './online-subscriptions.service';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { OnlineSubscriptionsController } from './online-subscriptions.controller';
import { OnlineProofStorageService } from './online-proof-storage.service';
import { OnlinePaymentMethodsController } from './online-payment-methods.controller';

@Module({ imports: [ConfigModule, BranchScopeModule, ClubSubscriptionsModule], controllers: [OnlineSubscriptionsController, OnlinePaymentMethodsController], providers: [OnlineSubscriptionsService, OnlineProofStorageService], exports: [OnlineSubscriptionsService, OnlineProofStorageService] })
export class OnlineSubscriptionsModule {}
