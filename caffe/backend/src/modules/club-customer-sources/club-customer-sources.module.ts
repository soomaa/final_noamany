import { Module } from '@nestjs/common';
import { ClubCustomerSourcesController } from './club-customer-sources.controller';
import { ClubCustomerSourcesService } from './club-customer-sources.service';

@Module({
  controllers: [ClubCustomerSourcesController],
  providers: [ClubCustomerSourcesService],
  exports: [ClubCustomerSourcesService],
})
export class ClubCustomerSourcesModule {}
