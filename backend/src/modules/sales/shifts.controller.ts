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
import {
  CreateShiftDto,
  CurrentShiftQueryDto,
  ListShiftsDto,
  ShiftRevenueQueryDto,
  UpdateShiftDto,
} from './dto/shifts.dto';
import { ShiftsService } from './shifts.service';

@UseGuards(JwtAuthGuard)
@Controller('shifts')
@RequiresPermission('gym-sales.sales:view')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get()
  list(@Query() query: ListShiftsDto) {
    return this.service.list(query);
  }

  @Get('current')
  getCurrent(@Query() query: CurrentShiftQueryDto) {
    return this.service.getCurrent(query);
  }

  @Get('schedule-status')
  scheduleStatus(@Query() query: CurrentShiftQueryDto) {
    return this.service.getScheduleStatus(query);
  }

  @Get('eligible-users')
  eligibleUsers(@Query('branchId') branchId?: string) {
    return this.service.eligibleUsers(branchId ? Number(branchId) : undefined);
  }

  @Get('revenue')
  getAllRevenue(@Query() query: ShiftRevenueQueryDto) {
    return this.service.getAllRevenue(query);
  }

  @Get(':id/revenue')
  getShiftRevenue(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ShiftRevenueQueryDto,
  ) {
    return this.service.getShiftRevenue(id, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.sales:create')
  create(@Body() body: CreateShiftDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.sales:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateShiftDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.sales:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
