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

@UseGuards(JwtAuthGuard)
@Controller('club-trainers')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view')
export class ClubTrainersController {
  constructor(private readonly service: ClubTrainersService) {}

  @Get()
  list(@Query() query: ListClubTrainersDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics() {
    return this.service.statistics();
  }

  @Get('earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:view')
  allEarningPayments() {
    return this.service.listEarningPayments();
  }

  @Get(':id/details')
  details(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findDetails(id, { dateFrom, dateTo });
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
  earningPayments(@Param('id', ParseIntPipe) id: number) {
    return this.service.listEarningPayments(id);
  }

  @Get(':id/earnings-summary')
  @RequiresPermission('club.fitness.trainer_payments:view')
  earningsSummary(
    @Param('id', ParseIntPipe) id: number,
    @Query('periodFrom') periodFrom: string,
    @Query('periodTo') periodTo: string,
  ) {
    return this.service.earningsSummary(id, periodFrom, periodTo);
  }

  @Post(':id/earning-payments')
  @RequiresPermission('club.fitness.trainer_payments:create', 'club.fitness.trainer_payments:update')
  createEarningPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount?: number; paymentDate?: string; periodFrom?: string; periodTo?: string; notes?: string },
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.createEarningPayment(id, body, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Post(':id/ratings')
  @RequiresPermission('club.fitness:create')
  addRating(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.addRating(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
