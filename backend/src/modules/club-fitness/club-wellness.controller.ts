import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClubWellnessService } from './club-wellness.service';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-services')
@RequiresPermission('club.fitness:view')
export class ClubInbodyServicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get('catalog')
  catalog() {
    return this.service.listInbodyServicesCatalog();
  }

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listInbodyServices(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findInbodyService(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createInbodyService(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateInbodyService(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeInbodyService(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-measurements')
@RequiresPermission('club.fitness:view')
export class ClubInbodyMeasurementsController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listInbodyMeasurements(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findInbodyMeasurement(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createInbodyMeasurement(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateInbodyMeasurement(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeInbodyMeasurement(id);
  }
}

/** Flutter/admin alias: POST /api/admin/inbody */
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminInbodyController {
  constructor(private readonly service: ClubWellnessService) {}

  @Post('inbody')
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createInbodyMeasurement(body);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-invoices')
@RequiresPermission('club.fitness:view')
export class ClubInbodyInvoicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listInbodyInvoices(query);
  }

  @Get('member-benefits/by-code')
  benefits(@Query('memberCode') memberCode: string) {
    return this.service.getMemberBenefits(memberCode);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findInbodyInvoice(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.service.createInbodyInvoice(body, userId);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateInbodyInvoice(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeInbodyInvoice(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-services')
@RequiresPermission('club.fitness:view')
export class ClubSpaServicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get('catalog')
  catalog() {
    return this.service.listSpaServicesCatalog();
  }

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listSpaServices(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSpaService(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createSpaService(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateSpaService(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSpaService(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-bookings')
@RequiresPermission('club.fitness:view')
export class ClubSpaBookingsController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listSpaBookings(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSpaBooking(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createSpaBooking(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateSpaBooking(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSpaBooking(id);
  }
}

/**
 * Scanner-only SPA entry point.  It intentionally has no booking input: the
 * active subscription is the authority for admission and available SPA visits.
 */
@UseGuards(JwtAuthGuard)
@Controller('club-spa-attendance')
@RequiresPermission('club.fitness:view')
export class ClubSpaAttendanceController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listSpaAttendance(query);
  }

  @Post('barcode-check-in')
  @RequiresPermission('club.fitness:create')
  barcodeCheckIn(@Body('memberCode') memberCode: string, @CurrentUser('sub') userId: number) {
    return this.service.checkInSpaByBarcode(memberCode, userId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-invoices')
@RequiresPermission('club.fitness:view')
export class ClubSpaInvoicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listSpaInvoices(query);
  }

  @Get('member-benefits/by-code')
  benefits(@Query('memberCode') memberCode: string) {
    return this.service.getMemberBenefits(memberCode);
  }

  @Post('barcode-check-in')
  @RequiresPermission('club.fitness:create')
  barcodeCheckIn(@Body('memberCode') memberCode: string, @CurrentUser('sub') userId: number) {
    return this.service.checkInSpaByBarcode(memberCode, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSpaInvoice(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser('sub') userId: number) {
    return this.service.createSpaInvoice(body, userId);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateSpaInvoice(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSpaInvoice(id);
  }
}
