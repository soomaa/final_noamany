import { Module } from '@nestjs/common';
import { SalaryScaleController } from './salary-scale.controller';
import { SalaryScaleService } from './salary-scale.service';

@Module({
  controllers: [SalaryScaleController],
  providers: [SalaryScaleService],
})
export class SalaryScaleModule {}
