import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateOvertimeRequestDto, ListOvertimeRequestsDto, OvertimeActionDto } from './dto/overtime-request.dto';
import { OvertimeRequestsService } from './overtime-requests.service';

/**
 * Web: employee overtime requests (direct manager → HR). Who may decide is checked in the
 * service (routed recipient, or HR / admin override), not by the page permission.
 */
@UseGuards(JwtAuthGuard)
@Controller('overtime-requests')
@RequiresPermission('leaves.requests:view')
export class OvertimeRequestsController {
  constructor(private readonly overtime: OvertimeRequestsService) {}

  @Get()
  list(@Query() query: ListOvertimeRequestsDto, @CurrentUser() user: JwtUser) {
    return this.overtime.list(query, user);
  }

  @Post()
  @RequiresPermission('leaves.requests:create', 'leaves.requests:view')
  create(@Body() dto: CreateOvertimeRequestDto, @CurrentUser() user: JwtUser) {
    return this.overtime.create(dto, user, true);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.overtime.findOne(id, user);
  }

  @Post(':id/action')
  action(@Param('id', ParseIntPipe) id: number, @Body() dto: OvertimeActionDto, @CurrentUser() user: JwtUser) {
    return this.overtime.action(id, dto, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.overtime.cancel(id, user);
  }
}
