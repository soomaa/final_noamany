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
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { CarryOverLeaveDto, CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/leave-type.dto';

@UseGuards(JwtAuthGuard)
@Controller('leaves')
@RequiresPermission('leaves.list:view')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Get('types')
  @RequiresPermission('leaves.types:view')
  listTypes(@Query() query: PaginationDto) {
    return this.leaves.listTypes(query);
  }

  @Post('types')
  @RequiresPermission('leaves.types:create')
  createType(@Body() body: CreateLeaveTypeDto) {
    return this.leaves.createType(body);
  }

  @Patch('types/:id')
  @RequiresPermission('leaves.types:update')
  updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateLeaveTypeDto,
  ) {
    return this.leaves.updateType(id, body);
  }

  @Delete('types/:id')
  @RequiresPermission('leaves.types:delete')
  removeType(@Param('id', ParseIntPipe) id: number) {
    return this.leaves.removeType(id);
  }

  @Post('carry-over')
  @RequiresPermission('leaves.balances:configure')
  carryOver(@Body() body: CarryOverLeaveDto, @CurrentUser('sub') userId: number) {
    return this.leaves.carryOver(body.year, userId);
  }

  @Get('balances')
  @RequiresPermission('leaves.balances:view')
  balances(@Query() query: PaginationDto) {
    return this.leaves.balances(query);
  }

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.leaves.list(query);
  }

  @Post()
  @RequiresPermission('leaves.list:create')
  create(@Body() body: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.leaves.create(body, user.sub, user.name ?? undefined);
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
  @RequiresPermission('leaves.list:update')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.leaves.cancel(id, user.sub, user.name ?? undefined);
  }
}
