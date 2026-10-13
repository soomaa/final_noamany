import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PortalCustomerGuard } from './portal-customer.guard';
import { PublicPortalController } from './public-portal.controller';
import { PublicPortalService } from './public-portal.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [ConfigModule, JwtModule.register({}), UploadsModule],
  controllers: [PublicPortalController],
  providers: [PublicPortalService, PortalCustomerGuard],
  exports: [PublicPortalService],
})
export class PublicPortalModule {}
