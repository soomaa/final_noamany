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
import { ClubHallsService } from './club-halls.service';
import { ListClubHallBookingsDto, ListClubHallsDto } from './dto/list-club-halls.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-halls')
@RequiresPermission('club.fitness:view')
export class ClubHallsController {
  constructor(private readonly service: ClubHallsService) {}

  @Get('statistics')
  statistics(@Query('branch') branch?: string) {
    return this.service.hallStatistics(branch);
  }

  @Get()
  list(@Query() query: ListClubHallsDto) {
    return this.service.listHalls(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findHall(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createHall(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateHall(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeHall(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-hall-bookings')
@RequiresPermission('club.fitness:view')
export class ClubHallBookingsController {
  constructor(private readonly service: ClubHallsService) {}

  @Get()
  list(@Query() query: ListClubHallBookingsDto) {
    return this.service.listBookings(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findBooking(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createBooking(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateBooking(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeBooking(id);
  }
}
