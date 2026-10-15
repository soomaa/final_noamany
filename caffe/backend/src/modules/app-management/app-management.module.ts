import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AppManagementController } from './app-management.controller';
import { AppManagementService } from './app-management.service';
import { AppManagementExpiryCron } from './app-management-expiry.cron';

@Module({
  imports: [PrismaModule],
  controllers: [AppManagementController],
  providers: [AppManagementService, AppManagementExpiryCron],
  exports: [AppManagementService],
})
export class AppManagementModule {}
