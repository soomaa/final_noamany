import { Global, Module } from '@nestjs/common';
import { HrPayrollSettingsController } from './hr-payroll-settings.controller';
import { HrPayrollSettingsService } from './hr-payroll-settings.service';

/** Global so payroll and attendance can read the owner's rules without a module import cycle. */
@Global()
@Module({
  controllers: [HrPayrollSettingsController],
  providers: [HrPayrollSettingsService],
  exports: [HrPayrollSettingsService],
})
export class HrPayrollSettingsModule {}
