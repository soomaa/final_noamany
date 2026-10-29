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
import type { JwtUser } from '../../common/types/jwt-user';
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
  list(@Query() query: ListShiftsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('current')
  getCurrent(@Query() query: CurrentShiftQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.getCurrent(query, user);
  }

  @Get('schedule-status')
  scheduleStatus(@Query() query: CurrentShiftQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.getScheduleStatus(query, user);
  }

  @Get('eligible-users')
  eligibleUsers(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.eligibleUsers(branchId ? Number(branchId) : undefined, user);
  }

  @Get('revenue')
  getAllRevenue(@Query() query: ShiftRevenueQueryDto, @CurrentUser() user: JwtUser) {
    return this.service.getAllRevenue(query, user);
  }

  @Get(':id/revenue')
  getShiftRevenue(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ShiftRevenueQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getShiftRevenue(id, query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.sales:create')
  create(@Body() body: CreateShiftDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.sales:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateShiftDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.sales:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
