import { Module } from '@nestjs/common';
import { UserAdminController } from './user-admin.controller';
import { UserAdminService } from './user-admin.service';
import { AuthModule } from '../auth/auth.module';
import { BusinessAuditModule } from '../../common/audit/business-audit.module';

@Module({
  imports: [AuthModule, BusinessAuditModule],
  controllers: [UserAdminController],
  providers: [UserAdminService],
  exports: [UserAdminService],
})
export class UserAdminModule {}
