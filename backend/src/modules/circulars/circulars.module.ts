import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { CircularsController } from './circulars.controller';
import { CircularsService } from './circulars.service';

@Module({
  imports: [PushModule],
  controllers: [CircularsController],
  providers: [CircularsService],
  exports: [CircularsService],
})
export class CircularsModule {}
