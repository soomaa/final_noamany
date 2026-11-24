import { Module } from '@nestjs/common';
import { AttendanceExceptionsController } from './attendance-exceptions.controller';
import { AttendanceExceptionsService } from './attendance-exceptions.service';

@Module({
  controllers: [AttendanceExceptionsController],
  providers: [AttendanceExceptionsService],
  exports: [AttendanceExceptionsService],
})
export class AttendanceExceptionsModule {}
