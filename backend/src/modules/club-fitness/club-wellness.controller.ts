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
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-services')
@RequiresPermission('club.fitness.inbody_invoices:view')
export class ClubInbodyServicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get('catalog')
  catalog(@CurrentUser() user: JwtUser) {
    return this.service.listInbodyServicesCatalog(user);
  }

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listInbodyServices(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findInbodyService(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.inbody_invoices:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createInbodyService(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.inbody_invoices:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateInbodyService(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.inbody_invoices:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeInbodyService(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-settings')
@RequiresPermission('club.fitness.inbody_invoices:view')
export class ClubInbodySettingsController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get(':branchId')
  get(
    @Param('branchId', ParseIntPipe) branchId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getInbodyBranchSettings(branchId, user);
  }

  @Put(':branchId')
  @RequiresPermission('club.fitness.inbody_invoices:update')
  update(
    @Param('branchId', ParseIntPipe) branchId: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateInbodyBranchSettings(branchId, body, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-measurements')
@RequiresPermission('club.fitness.inbody_invoices:view')
export class ClubInbodyMeasurementsController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listInbodyMeasurements(query, user);
  }

  @Get('member-benefits/by-code')
  benefits(@Query('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.getInbodyMemberContext(memberCode, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findInbodyMeasurement(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.inbody_invoices:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createInbodyMeasurement(body, user);
  }

  @Post('record')
  @RequiresPermission('club.fitness.inbody_invoices:create')
  record(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.recordInbodyMeasurement(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.inbody_invoices:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateInbodyMeasurement(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.inbody_invoices:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeInbodyMeasurement(id, user);
  }
}

/** Flutter/admin alias: POST /api/admin/inbody */
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminInbodyController {
  constructor(private readonly service: ClubWellnessService) {}

  @Post('inbody')
  @RequiresPermission('club.fitness.inbody_invoices:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createInbodyMeasurement(body, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-invoices')
@RequiresPermission('club.fitness.inbody_invoices:view')
export class ClubInbodyInvoicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listInbodyInvoices(query, user);
  }

  @Get('member-benefits/by-code')
  benefits(@Query('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.getMemberBenefits(memberCode, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findInbodyInvoice(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.inbody_invoices:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createInbodyInvoice(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.inbody_invoices:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateInbodyInvoice(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.inbody_invoices:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeInbodyInvoice(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-services')
@RequiresPermission('club.fitness.spa_services:view')
export class ClubSpaServicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get('catalog')
  catalog(@CurrentUser() user: JwtUser) {
    return this.service.listSpaServicesCatalog(user);
  }

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listSpaServices(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findSpaService(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.spa_services:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createSpaService(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.spa_services:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateSpaService(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.spa_services:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeSpaService(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-bookings')
@RequiresPermission('club.fitness.spa_bookings:view')
export class ClubSpaBookingsController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listSpaBookings(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findSpaBooking(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.spa_bookings:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createSpaBooking(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.spa_bookings:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateSpaBooking(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.spa_bookings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeSpaBooking(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-spa-invoices')
@RequiresPermission('club.fitness.spa_invoices:view')
export class ClubSpaInvoicesController {
  constructor(private readonly service: ClubWellnessService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listSpaInvoices(query, user);
  }

  @Get('member-benefits/by-code')
  benefits(@Query('memberCode') memberCode: string, @CurrentUser() user: JwtUser) {
    return this.service.getMemberBenefits(memberCode, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findSpaInvoice(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.spa_invoices:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createSpaInvoice(body, user.sub, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.spa_invoices:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateSpaInvoice(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.spa_invoices:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeSpaInvoice(id, user);
  }
}
