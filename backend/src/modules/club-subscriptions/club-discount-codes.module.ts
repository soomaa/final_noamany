import { Module } from '@nestjs/common';
import { ClubDiscountCodesController } from './club-discount-codes.controller';
import { ClubDiscountCodesService } from './club-discount-codes.service';

@Module({
  controllers: [ClubDiscountCodesController],
  providers: [ClubDiscountCodesService],
  exports: [ClubDiscountCodesService],
})
export class ClubDiscountCodesModule {}

