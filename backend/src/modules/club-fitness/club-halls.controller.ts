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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-halls')
@RequiresPermission('club.fitness.room_bookings:view')
export class ClubHallsController {
  constructor(private readonly service: ClubHallsService) {}

  @Get('statistics')
  statistics(@Query('branch') branch?: string, @CurrentUser() user?: JwtUser) {
    return this.service.hallStatistics(branch, user);
  }

  @Get()
  @RequiresPermission('club.fitness.room_bookings:view', 'club.subscriptions.special:view')
  list(@Query() query: ListClubHallsDto, @CurrentUser() user: JwtUser) {
    return this.service.listHalls(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findHall(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.room_bookings:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createHall(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.room_bookings:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateHall(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.room_bookings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeHall(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-hall-bookings')
@RequiresPermission('club.fitness.room_bookings:view')
export class ClubHallBookingsController {
  constructor(private readonly service: ClubHallsService) {}

  @Get()
  list(@Query() query: ListClubHallBookingsDto, @CurrentUser() user: JwtUser) {
    return this.service.listBookings(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findBooking(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.room_bookings:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createBooking(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.room_bookings:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateBooking(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.room_bookings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeBooking(id, user);
  }
}
