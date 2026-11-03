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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubTrainersService } from './club-trainers.service';
import { ListClubTrainersDto } from './dto/list-club-trainers.dto';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-trainers')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view')
export class ClubTrainersController {
  constructor(private readonly service: ClubTrainersService) {}

  @Get()
  list(@Query() query: ListClubTrainersDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser) {
    return this.service.statistics(user);
  }

  @Get('earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:view')
  allEarningPayments(@CurrentUser() user: JwtUser) {
    return this.service.listEarningPayments(undefined, user);
  }

  @Get(':id/details')
  details(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.findDetails(id, { dateFrom, dateTo }, user);
  }

  @Get(':id/ratings')
  listRatings(@Param('id', ParseIntPipe) id: number) {
    return this.service.listRatings(id);
  }

  @Get(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:view', 'club.fitness:view')
  defaultSchedule(@Param('id', ParseIntPipe) id: number, @Query('classTypeId') classTypeId?: string) {
    return this.service.getDefaultSchedule(id, classTypeId ? Number(classTypeId) : undefined);
  }

  @Put(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:update', 'club.fitness:update')
  replaceDefaultSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { classTypeId?: number; slots?: Array<Record<string, unknown>> },
  ) {
    return this.service.replaceDefaultSchedule(id, body);
  }

  @Get(':id/earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:view', 'club.subscriptions.special:view')
  earningPayments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.listEarningPayments(id, user);
  }

  @Get(':id/earnings-summary')
  @RequiresPermission('club.fitness.trainer_payments:view')
  earningsSummary(
    @Param('id', ParseIntPipe) id: number,
    @Query('periodFrom') periodFrom: string,
    @Query('periodTo') periodTo: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.earningsSummary(id, periodFrom, periodTo, user);
  }

  @Post(':id/earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:create', 'club.fitness.trainer_payments:update')
  createEarningPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount?: number; paymentDate?: string; periodFrom?: string; periodTo?: string; notes?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createEarningPayment(id, body, user.sub, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Post('external')
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create')
  createExternal(@Body() body: Record<string, unknown>) {
    return this.service.createExternal(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Post(':id/ratings')
  @RequiresPermission('club.fitness:create')
  addRating(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.addRating(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
