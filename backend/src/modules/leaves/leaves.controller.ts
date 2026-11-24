import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { ListLeavesDto } from './dto/list-leaves.dto';
import { ActionLeaveDto, ApproveLeaveDto, ResubmitLeaveDto } from './dto/action-leave.dto';

@UseGuards(JwtAuthGuard)
@Controller('leaves')
@RequiresPermission('leaves:view')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Get('types')
  listTypes(@Query() query: PaginationDto) {
    return this.leaves.listTypes(query);
  }

  @Post('types')
  @RequiresPermission('leaves.types:create', 'leaves:configure')
  createType(
    @Body()
    body: {
      title?: string;
      minDays?: number;
      maxDays?: number;
      agazaTtype?: number;
      dateFrom?: string;
      dateTo?: string;
      hasSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.leaves.createType(body);
  }

  @Patch('types/:id')
  @RequiresPermission('leaves.types:update', 'leaves:configure')
  updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      minDays?: number;
      maxDays?: number;
      agazaTtype?: number;
      dateFrom?: string;
      dateTo?: string;
      hasSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.leaves.updateType(id, body);
  }

  @Delete('types/:id')
  @RequiresPermission('leaves.types:delete', 'leaves:configure')
  removeType(@Param('id', ParseIntPipe) id: number) {
    return this.leaves.removeType(id);
  }

  @Post('carry-over')
  @RequiresPermission('leaves:configure')
  carryOver(@Body() body: { year?: number }) {
    return this.leaves.carryOver(body.year);
  }

  @Get('balances')
  balances(@Query() query: PaginationDto, @CurrentUser() user: JwtUser) {
    return this.leaves.balances(query, user);
  }

  @Get('available')
  available(
    @Query('empId', ParseIntPipe) empId: number,
    @Query('leaveTypeId', ParseIntPipe) leaveTypeId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.available(empId, leaveTypeId, user);
  }

  @Get()
  list(@Query() query: ListLeavesDto, @CurrentUser() user: JwtUser) {
    return this.leaves.list(query, user);
  }

  @Post()
  create(@Body() body: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.create(body, user.sub, user.name ?? undefined, undefined, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { startDate?: string; endDate?: string; returnToWorkDate?: string; reason?: string; addressSinceAgaza?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.remove(id, user);
  }

  @Post(':id/approve')
  @RequiresPermission('leaves.list:approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body?: ApproveLeaveDto,
  ) {
    // Optional startDate/endDate = partial approval inside the requested range.
    return this.leaves.approve(id, user.sub, user.name ?? undefined, user, body ?? undefined);
  }

  @Post(':id/reject')
  @RequiresPermission('leaves.list:reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body?: ApproveLeaveDto,
  ) {
    return this.leaves.reject(id, user.sub, user.name ?? undefined, user, body?.reason);
  }

  /**
   * One decision on the pending step: accept | reject | return («إرجاع للتعديل», comment
   * required). Who may decide is checked in the service (routed recipient, or HR / admin).
   */
  @Post(':id/action')
  action(@Param('id', ParseIntPipe) id: number, @Body() body: ActionLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.action(id, body, user.sub, user.name ?? undefined, user);
  }

  /** Edit + resubmit after «إرجاع للتعديل»; resumes at the step that returned it. */
  @Post(':id/resubmit')
  resubmit(@Param('id', ParseIntPipe) id: number, @Body() body: ResubmitLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.resubmit(id, body, user);
  }

  /** Unified request card (status chip, timeline, available actions). */
  @Get(':id/flow')
  flow(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.flow(id, user);
  }

  /** Original requested range when the leave was partially approved (null otherwise). */
  @Get(':id/requested-range')
  requestedRange(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.requestedRange(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.cancel(id, user.sub, user.name ?? undefined, user);
  }
}
