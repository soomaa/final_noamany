import { Module } from '@nestjs/common';
import { HrMobileContentController, MobileHrContentController } from './hr-mobile-content.controller';
import { HrMobileContentService } from './hr-mobile-content.service';

@Module({
  controllers: [HrMobileContentController, MobileHrContentController],
  providers: [HrMobileContentService],
  exports: [HrMobileContentService],
})
export class HrMobileContentModule {}
