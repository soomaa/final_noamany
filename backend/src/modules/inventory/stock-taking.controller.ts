import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import { ListStockTakingDto, UpsertCountItemDto, UpsertCountSessionDto } from './dto/inventory.dto';
import { StockTakingService } from './stock-taking.service';

@UseGuards(JwtAuthGuard)
@Controller('stock-taking')
@RequiresPermission('gym-sales.inventory.stock_taking:view')
export class StockTakingController {
  constructor(private readonly service: StockTakingService) {}

  @Get()
  listSessions(@Query() query: ListStockTakingDto) {
    return this.service.listSessions(query);
  }

  @Post('adjustments/:id/approve')
  @RequiresPermission('gym-sales.inventory.stock_taking:approve')
  approveAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.approveAdjustment(id, userId, isDryRun(dryRun));
  }

  @Post(':id/finalize')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  finalizeSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.finalizeSession(id, userId);
  }

  @Get(':id')
  findSession(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSession(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.stock_taking:create')
  createSession(@Body() body: UpsertCountSessionDto, @CurrentUser() user: JwtUser) {
    return this.service.createSession(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  updateSession(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertCountSessionDto>) {
    return this.service.updateSession(id, body);
  }

  @Post(':id/items')
  @RequiresPermission('gym-sales.inventory.stock_taking:create')
  addCountItem(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCountItemDto) {
    return this.service.addCountItem(id, body);
  }

  @Patch(':sessionId/items/:itemId')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  updateCountItem(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: UpsertCountItemDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateCountItem(sessionId, itemId, body, user);
  }

  @Delete(':sessionId/items/:itemId')
  @RequiresPermission('gym-sales.inventory.stock_taking:delete')
  removeCountItem(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.removeCountItem(sessionId, itemId, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.stock_taking:delete')
  removeSession(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSession(id);
  }
}
