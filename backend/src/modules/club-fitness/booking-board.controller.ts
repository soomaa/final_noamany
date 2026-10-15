import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { BookingBoardService, QuickBookBody } from './booking-board.service';

/**
 * Day board for reception and branch managers. Read/write keys fall back to the existing
 * session permissions so the screen works for whoever already books classes today.
 */
@UseGuards(JwtAuthGuard)
@Controller('club/booking-board')
export class BookingBoardController {
  constructor(private readonly service: BookingBoardService) {}

  @Get('day')
  @RequiresPermission(
    'club.fitness.booking_board:view',
    'club.fitness.personal_sessions:view',
    'club.subscriptions.special:view',
  )
  day(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @Query('classTypeId') classTypeId?: string,
    @Query('trainerId') trainerId?: string,
    @Query('showIdle') showIdle?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.day({
      date,
      branchId: branchId && branchId !== 'all' ? Number(branchId) : undefined,
      classTypeId: classTypeId && classTypeId !== 'all' ? Number(classTypeId) : undefined,
      trainerId: trainerId && trainerId !== 'all' ? Number(trainerId) : undefined,
      showIdle: showIdle === 'true' || showIdle === '1',
    }, user);
  }

  @Post('book')
  @RequiresPermission(
    'club.fitness.booking_board:create',
    'club.fitness.personal_sessions:create',
    'club.subscriptions.special:create',
  )
  book(@Body() body: QuickBookBody, @CurrentUser() user: JwtUser) {
    return this.service.quickBook(body, user);
  }

  @Delete('book/:classId/:memberId')
  @RequiresPermission(
    'club.fitness.booking_board:delete',
    'club.fitness.personal_sessions:delete',
    'club.subscriptions.special:delete',
  )
  cancel(
    @Param('classId', ParseIntPipe) classId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancelBooking(classId, memberId, user);
  }
}
