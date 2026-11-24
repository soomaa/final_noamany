import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { AttendanceOfflineReviewService } from './attendance-offline-review.service';
import { ApproveOfflinePunchesDto, ListOfflinePunchesDto, RejectOfflinePunchDto } from './dto/offline-review.dto';

/** «بصمات أوفلاين للمراجعة» — HR / branch manager review of offline-synced app punches. */
@UseGuards(JwtAuthGuard)
@Controller('attendance/offline-punches')
@RequiresPermission('attendance:view', 'attendance.board:view', 'attendance.exceptions:view')
export class AttendanceOfflineReviewController {
  constructor(private readonly review: AttendanceOfflineReviewService) {}

  @Get()
  list(@Query() query: ListOfflinePunchesDto, @CurrentUser() user: JwtUser) {
    return this.review.list(query, user);
  }

  @Post('approve')
  @HttpCode(200)
  @RequiresPermission('attendance:update', 'attendance.board:update', 'attendance.exceptions:update')
  approve(@Body() body: ApproveOfflinePunchesDto, @CurrentUser() user: JwtUser) {
    return this.review.approve(body.ids, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequiresPermission('attendance:update', 'attendance.board:update', 'attendance.exceptions:update')
  reject(@Param('id', ParseIntPipe) id: number, @Body() body: RejectOfflinePunchDto, @CurrentUser() user: JwtUser) {
    return this.review.reject(id, body.reason, user);
  }
}
