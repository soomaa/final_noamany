import { Module } from '@nestjs/common';
import { BranchScopeModule } from '../../common/branch-scope/branch-scope.module';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { OnlineSubscriptionsController } from './online-subscriptions.controller';
import { OnlineSubscriptionsService } from './online-subscriptions.service';
@Module({imports:[BranchScopeModule,ClubSubscriptionsModule],controllers:[OnlineSubscriptionsController],providers:[OnlineSubscriptionsService]}) export class OnlineSubscriptionsModule {}
