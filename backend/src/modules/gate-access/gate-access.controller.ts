import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import {
  CreateGateControllerDto,
  GateEventsQueryDto,
  OpenGateDoorDto,
  UpdateGateControllerDto,
} from './dto/gate-access.dto';
import { GateAccessService } from './gate-access.service';
import { JwtUser } from '../../common/types/jwt-user';

@Controller('gate-access')
@RequiresPermission('club.gate_access:view')
export class GateAccessController {
  constructor(private readonly service: GateAccessService) {}

  @Get('reception/controllers')
  @RequiresPermission('club.reception:create', 'club.gate_access:execute')
  async receptionControllers(@CurrentUser() user: JwtUser) {
    return (await this.service.listControllers(user)).map((controller) => ({
      id: controller.id,
      name: controller.name,
      branchId: controller.branchId,
      status: controller.status,
      entryDoorNo: controller.entryDoorNo,
      isActive: controller.isActive,
    }));
  }

  @Post('reception/controllers/:id/open')
  @RequiresPermission('club.reception:create', 'club.gate_access:execute')
  async receptionOpen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    const controllers = await this.service.listControllers(user);
    const controller = controllers.find((item) => item.id === id);
    return this.service.queueOpenDoor(id, { doorNo: controller?.entryDoorNo ?? 1, seconds: 1 }, user);
  }

  @Get('reception/controllers/:id/commands/:commandId')
  @RequiresPermission('club.reception:create', 'club.gate_access:execute')
  receptionCommand(
    @Param('id', ParseIntPipe) id: number,
    @Param('commandId') commandId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.commandStatus(id, commandId, user);
  }

  @Get('controllers')
  listControllers(@CurrentUser() user: JwtUser) {
    return this.service.listControllers(user);
  }

  @Post('controllers')
  @RequiresPermission('club.gate_access:configure')
  createController(@Body() dto: CreateGateControllerDto, @CurrentUser() user: JwtUser) {
    return this.service.createController(dto, user);
  }

  @Patch('controllers/:id')
  @RequiresPermission('club.gate_access:configure')
  updateController(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGateControllerDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateController(id, dto, user);
  }

  @Post('controllers/:id/rotate-token')
  @RequiresPermission('club.gate_access:configure')
  rotateToken(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.rotateToken(id, user);
  }

  @Post('controllers/:id/open')
  @RequiresPermission('club.gate_access:execute')
  openDoor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OpenGateDoorDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.queueOpenDoor(id, dto, user);
  }

  @Get('events')
  listEvents(@Query() query: GateEventsQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.listEvents(query, user);
  }
}
