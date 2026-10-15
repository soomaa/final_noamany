import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  list(@Query() query: ListBookingsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
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
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.addPayment(id, body, userId);
  }

  @Post(':id/refunds')
  @RequiresPermission('gym-sales.sales:update')
  addRefund(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: BookingPaymentDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.addRefund(id, body, userId);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.sales:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateBookingStatusDto) {
    return this.service.updateStatus(id, body.status);
  }
}
