import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { AttendanceExceptionsService } from './attendance-exceptions.service';
import { ListAttendanceExceptionsDto, ResolveAttendanceExceptionDto } from './dto/attendance-exceptions.dto';

/** «الحالات اليومية» — RBAC resource `attendance.exceptions` (view / update). */
@UseGuards(JwtAuthGuard)
@Controller('attendance/exceptions')
@RequiresPermission('attendance.exceptions:view')
export class AttendanceExceptionsController {
  constructor(private readonly exceptions: AttendanceExceptionsService) {}

  @Get()
  list(@Query() query: ListAttendanceExceptionsDto, @CurrentUser() user: JwtUser) {
    return this.exceptions.list(query, user);
  }

  /** Open-case counts for the banner on every page (cached ~60 s per user). */
  @Get('pending-summary')
  pendingSummary(@CurrentUser() user: JwtUser) {
    return this.exceptions.pendingSummary(user);
  }

  @Get('leave-types')
  leaveTypes() {
    return this.exceptions.leaveTypes();
  }

  @Post('resolve')
  @RequiresPermission('attendance.exceptions:update')
  resolve(@Body() body: ResolveAttendanceExceptionDto, @CurrentUser() user: JwtUser) {
    return this.exceptions.resolve(body, user);
  }
}
