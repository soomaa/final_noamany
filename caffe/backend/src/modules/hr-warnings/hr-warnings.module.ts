import { Module } from '@nestjs/common';
import { HrWarningsController } from './hr-warnings.controller';
import { HrWarningsService } from './hr-warnings.service';

@Module({
  controllers: [HrWarningsController],
  providers: [HrWarningsService],
  exports: [HrWarningsService],
})
export class HrWarningsModule {}
