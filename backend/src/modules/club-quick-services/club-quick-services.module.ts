import { Module } from '@nestjs/common';
import { ClubSubscriptionsModule } from '../club-subscriptions/club-subscriptions.module';
import { ClubQuickServicesController } from './club-quick-services.controller';
import { ClubQuickServicesService } from './club-quick-services.service';

@Module({
  imports: [ClubSubscriptionsModule],
  controllers: [ClubQuickServicesController],
  providers: [ClubQuickServicesService],
  exports: [ClubQuickServicesService],
})
export class ClubQuickServicesModule {}
