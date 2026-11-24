import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { AttendanceExceptionsController } from './attendance-exceptions.controller';
import { AttendanceExceptionsCron } from './attendance-exceptions.cron';
import { AttendanceExceptionsRemindersService } from './attendance-exceptions.reminders';
import { AttendanceExceptionsService } from './attendance-exceptions.service';

@Module({
  imports: [PushModule],
  controllers: [AttendanceExceptionsController],
  providers: [AttendanceExceptionsService, AttendanceExceptionsRemindersService, AttendanceExceptionsCron],
  exports: [AttendanceExceptionsService],
})
export class AttendanceExceptionsModule {}
