import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  BookingAvailabilityQueryDto,
  BookingTimeSlotsQueryDto,
  BookingPaymentDto,
  CreateBookingDto,
  ListBookingsDto,
  UpdateBookingStatusDto,
} from './dto/bookings.dto';
import { BookingsService } from './bookings.service';

@UseGuards(JwtAuthGuard)
@Controller('bookings')
@RequiresPermission('gym-sales.sales:view')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Get('services')
  listServices(@Query('branchId') branchId?: string) {
    return this.service.listServices(branchId ? Number(branchId) : undefined);
  }

  @Get('availability')
  availability(@Query() query: BookingAvailabilityQueryDto) {
    return this.service.availability(query);
  }

  @Get('time-slots')
  timeSlots(@Query() query: BookingTimeSlotsQueryDto) {
    return this.service.timeSlots(query);
  }

  @Get()
  list(@Query() query: ListBookingsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.sales:create')
  create(@Body() body: CreateBookingDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Post(':id/payments')
  @RequiresPermission('gym-sales.sales:create')
  addPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BookingPaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.addPayment(id, body, user.sub, user);
  }

  @Post(':id/refunds')
  @RequiresPermission('gym-sales.sales:update')
  addRefund(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BookingPaymentDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.addRefund(id, body, user.sub, user);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.sales:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateBookingStatusDto, @CurrentUser() user: JwtUser) {
    return this.service.updateStatus(id, body.status, user);
  }
}
