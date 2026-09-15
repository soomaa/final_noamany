import { Module } from '@nestjs/common';
import { FormsSettingsController } from './forms-settings.controller';
import { FormsSettingsService } from './forms-settings.service';

@Module({
  controllers: [FormsSettingsController],
  providers: [FormsSettingsService],
})
export class FormsSettingsModule {}
