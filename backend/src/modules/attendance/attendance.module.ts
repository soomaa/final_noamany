import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceDeviceAgentController } from './attendance-device-agent.controller';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';

@Module({
  controllers: [AttendanceController, AttendanceDeviceAgentController],
  providers: [AttendanceService, AttendanceDeviceAgentService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
