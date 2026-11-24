import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceDeviceAgentController } from './attendance-device-agent.controller';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';
import { AttendanceOfflineReviewController } from './attendance-offline-review.controller';
import { AttendanceOfflineReviewService } from './attendance-offline-review.service';

@Module({
  controllers: [AttendanceController, AttendanceDeviceAgentController, AttendanceOfflineReviewController],
  providers: [AttendanceService, AttendanceDeviceAgentService, AttendanceOfflineReviewService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
