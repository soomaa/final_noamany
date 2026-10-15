import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { gate_controllers } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import {
  GateCommandResultDto,
  GateEventDto,
  GateHeartbeatDto,
} from './dto/gate-access.dto';
import { GateAccessService } from './gate-access.service';
import { GateAgentAuthGuard } from './gate-agent-auth.guard';

@Public()
@UseGuards(GateAgentAuthGuard)
@Controller('gate-agent/:controllerId')
export class GateAgentController {
  constructor(private readonly service: GateAccessService) {}

  @Get('status')
  status(@Req() request: { gateController: gate_controllers }) {
    // The token guard already read this row. Never sync or claim commands here.
    const row = request.gateController;
    return {
      id: row.id,
      isActive: row.is_active,
      status: row.status,
      lastSeenAt: row.last_seen_at,
      lastSyncAt: row.last_sync_at,
      controller: { model: row.model, staticIp: row.static_ip, port: row.port, entryDoorNo: row.entry_door_no, exitDoorNo: row.exit_door_no },
    };
  }

  @Post('heartbeat')
  heartbeat(
    @Param('controllerId', ParseIntPipe) controllerId: number,
    @Body() dto: GateHeartbeatDto,
  ) {
    return this.service.heartbeat(controllerId, dto);
  }

  @Get('snapshot')
  snapshot(@Param('controllerId', ParseIntPipe) controllerId: number) {
    return this.service.snapshot(controllerId);
  }

  @Post('events')
  event(
    @Param('controllerId', ParseIntPipe) controllerId: number,
    @Body() dto: GateEventDto,
  ) {
    return this.service.ingestEvent(controllerId, dto);
  }

  @Get('commands')
  commands(@Param('controllerId', ParseIntPipe) controllerId: number) {
    return this.service.takeCommands(controllerId);
  }

  @Post('commands/:commandId/result')
  commandResult(
    @Param('controllerId', ParseIntPipe) controllerId: number,
    @Param('commandId') commandId: string,
    @Body() dto: GateCommandResultDto,
  ) {
    return this.service.completeCommand(controllerId, commandId, dto);
  }
}
