import { Module } from '@nestjs/common';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';

/** Register this leaf module in AppModule during the master integration pass. */
@Module({ controllers: [CustomerServiceController], providers: [CustomerServiceService], exports: [CustomerServiceService] })
export class CustomerServiceModule {}
