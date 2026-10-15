import { Module } from '@nestjs/common';
import { LoanSettingsController } from './loan-settings.controller';
import { LoanSettingsService } from './loan-settings.service';

@Module({
  controllers: [LoanSettingsController],
  providers: [LoanSettingsService],
})
export class LoanSettingsModule {}
