import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { PushModule } from '../push/push.module';
import { OvertimeRequestsController } from './overtime-requests.controller';
import { OvertimeRequestsService } from './overtime-requests.service';

@Module({
  imports: [AttendanceModule, PushModule],
  controllers: [OvertimeRequestsController],
  providers: [OvertimeRequestsService],
  exports: [OvertimeRequestsService],
})
export class OvertimeRequestsModule {}
