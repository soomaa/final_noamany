import { Module } from '@nestjs/common';
import { InsuranceSettingsController } from './insurance-settings.controller';
import { InsuranceSettingsService } from './insurance-settings.service';

@Module({
  controllers: [InsuranceSettingsController],
  providers: [InsuranceSettingsService],
  exports: [InsuranceSettingsService],
})
export class InsuranceSettingsModule {}
