import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { LeavesModule } from '../leaves/leaves.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LegacyMobileController } from './legacy-mobile.controller';
import { LegacyMobileCompatService } from './legacy-mobile-compat.service';
import { UploadsModule } from '../uploads/uploads.module';
import { LoansModule } from '../loans/loans.module';

@Module({
  imports: [AuthModule, PermissionsModule, LeavesModule, AttendanceModule, UploadsModule, LoansModule],
  controllers: [MobileController, LegacyMobileController],
  providers: [MobileService, LegacyMobileCompatService],
  exports: [MobileService, LegacyMobileCompatService],
})
export class MobileModule {}
