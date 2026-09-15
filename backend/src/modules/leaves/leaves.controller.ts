import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { ListLeavesDto } from './dto/list-leaves.dto';

@UseGuards(JwtAuthGuard)
@Controller('leaves')
@RequiresPermission('leaves:view')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Get('types')
  listTypes(@Query() query: PaginationDto) {
    return this.leaves.listTypes(query);
  }

  @Post('types')
  createType(
    @Body()
    body: {
      title?: string;
      minDays?: number;
      maxDays?: number;
      agazaTtype?: number;
      dateFrom?: string;
      dateTo?: string;
      hasSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.leaves.createType(body);
  }

  @Patch('types/:id')
  updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      minDays?: number;
      maxDays?: number;
      agazaTtype?: number;
      dateFrom?: string;
      dateTo?: string;
      hasSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.leaves.updateType(id, body);
  }

  @Delete('types/:id')
  removeType(@Param('id', ParseIntPipe) id: number) {
    return this.leaves.removeType(id);
  }

  @Post('carry-over')
  @RequiresPermission('leaves:configure')
  carryOver(@Body() body: { year?: number }) {
    return this.leaves.carryOver(body.year);
  }

  @Get('balances')
  balances(@Query() query: PaginationDto) {
    return this.leaves.balances(query);
  }

  @Get('available')
  available(
    @Query('empId', ParseIntPipe) empId: number,
    @Query('leaveTypeId', ParseIntPipe) leaveTypeId: number,
  ) {
    return this.leaves.available(empId, leaveTypeId);
  }

  @Get()
  list(@Query() query: ListLeavesDto, @CurrentUser() user: JwtUser) {
    return this.leaves.list(query, user);
  }

  @Post()
  create(@Body() body: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.create(body, user.sub, user.name ?? undefined);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { startDate?: string; endDate?: string; returnToWorkDate?: string; reason?: string; addressSinceAgaza?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.leaves.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.remove(id, user);
  }

  @Post(':id/approve')
  @RequiresPermission('leaves.list:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.approve(id, user.sub, user.name ?? undefined);
  }

  @Post(':id/reject')
  @RequiresPermission('leaves.list:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.reject(id, user.sub, user.name ?? undefined);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.cancel(id, user.sub, user.name ?? undefined);
  }
}
