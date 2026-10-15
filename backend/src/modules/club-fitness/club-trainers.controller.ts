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
import { ListClubTrainersDto, ListTrainerPerformanceDto } from './dto/list-club-trainers.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-trainers')
@RequiresPermission('club.fitness.trainers:view', 'club.subscriptions.special:view', 'app-management.trainers:view')
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

  @Get('performance')
  @RequiresPermission('club.fitness.trainer_payments:view', 'club.fitness.trainer_settings:view')
  performance(@Query() query: ListTrainerPerformanceDto) {
    return this.service.performance(query);
  }

  @Get(':id/details')
  details(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findDetails(id, { dateFrom, dateTo });
  }

  @Get(':id/workspace')
  workspace(
    @Param('id', ParseIntPipe) id: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.workspace(id, { dateFrom, dateTo });
  }

  @Get(':id/ratings')
  listRatings(@Param('id', ParseIntPipe) id: number) {
    return this.service.listRatings(id);
  }

  @Get(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:view', 'club.fitness.trainer_settings:view')
  defaultSchedule(@Param('id', ParseIntPipe) id: number, @Query('classTypeId') classTypeId?: string) {
    return this.service.getDefaultSchedule(id, classTypeId ? Number(classTypeId) : undefined);
  }

  @Put(':id/default-schedule')
  @RequiresPermission('club.subscriptions.special:update', 'club.fitness.trainer_settings:update')
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
  @RequiresPermission('club.fitness.trainer_payments:create')
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

  @Get(':id/availability')
  availability(@Param('id', ParseIntPipe) id: number) {
    return this.service.getAvailability(id);
  }

  @Put(':id/availability')
  @RequiresPermission('club.fitness.trainers:update', 'app-management.trainers:update')
  replaceAvailability(@Param('id', ParseIntPipe) id: number, @Body() body: { slots?: Array<Record<string, unknown>> }) {
    return this.service.replaceAvailability(id, body);
  }

  @Post()
  @RequiresPermission('club.fitness.trainers:create', 'app-management.trainers:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Post('external')
  @RequiresPermission('club.fitness.trainers:create', 'club.subscriptions.special:create')
  createExternal(@Body() body: Record<string, unknown>) {
    return this.service.createExternal(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.trainers:update', 'app-management.trainers:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Post(':id/ratings')
  @RequiresPermission('club.fitness.trainer_ratings:create')
  addRating(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.addRating(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.trainers:delete', 'app-management.trainers:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
