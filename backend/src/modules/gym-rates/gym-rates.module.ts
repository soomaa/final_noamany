import { Module } from '@nestjs/common';
import { GymRatesController } from './gym-rates.controller';
import { GymRatesService } from './gym-rates.service';

@Module({
  controllers: [GymRatesController],
  providers: [GymRatesService],
})
export class GymRatesModule {}
