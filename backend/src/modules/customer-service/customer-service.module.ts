import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CustomerServiceController } from './customer-service.controller';
import { CustomerServiceService } from './customer-service.service';

@Module({ imports: [PrismaModule], controllers: [CustomerServiceController], providers: [CustomerServiceService] })
export class CustomerServiceModule {}
