import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AttendanceDeviceAgentService } from './attendance-device-agent.service';
import { DevicePunchBatchDto } from './dto/device-punch.dto';

/**
 * Machine-to-machine endpoint for the on-site fingerprint agent. It carries no user JWT;
 * it is authenticated by the shared ATTENDANCE_AGENT_TOKEN sent as "X-Agent-Token".
 */
@Controller('attendance/device-agent')
export class AttendanceDeviceAgentController {
  constructor(private readonly agent: AttendanceDeviceAgentService) {}

  @Public()
  @Post('punches')
  @HttpCode(200)
  pushPunches(@Headers('x-agent-token') token: string | undefined, @Body() body: DevicePunchBatchDto) {
    this.agent.assertAgentToken(token);
    return this.agent.ingest(body);
  }
}
