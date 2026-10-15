import { Module } from '@nestjs/common';
import { ActionScreenController } from './action-screen.controller';
import { ActionScreenService } from './action-screen.service';

@Module({
  controllers: [ActionScreenController],
  providers: [ActionScreenService],
})
export class ActionScreenModule {}
