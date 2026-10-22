import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
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
  @RequiresPermission('gym-sales.inventory.stock_taking:view', 'gym-sales.inventory.stock_taking_report:view')
  listSessions(@Query() query: ListStockTakingDto, @CurrentUser() user: JwtUser) {
    return this.service.listSessions(query, user);
  }

  @Get('sheet')
  countSheet(
    @Query('warehouseId', ParseIntPipe) warehouseId: number,
    @CurrentUser() user: JwtUser,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.countSheet(warehouseId, categoryId ? Number(categoryId) : undefined, user);
  }

  @Post('adjustments/:id/approve')
  @RequiresPermission('gym-sales.inventory.stock_taking:approve')
  approveAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.approveAdjustment(id, user.sub, isDryRun(dryRun), user);
  }

  @Post(':id/finalize')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  async finalizeSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.service.findSession(id,user);
    return this.service.finalizeSession(id, user.sub);
  }

  @Get(':id')
  @RequiresPermission('gym-sales.inventory.stock_taking:view', 'gym-sales.inventory.stock_taking_report:view')
  findSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findSession(id, user);
  }

  @Post(':id/reopen')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  reopen(@Param('id', ParseIntPipe) id:number,@CurrentUser() user:JwtUser){
    return this.service.reopenSession(id,user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.stock_taking:create')
  createSession(@Body() body: UpsertCountSessionDto, @CurrentUser() user: JwtUser) {
    return this.service.createSession(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.stock_taking:update')
  async updateSession(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertCountSessionDto>, @CurrentUser() user: JwtUser) {
    await this.service.findSession(id,user);
    if (body.warehouseId || body.branchId) throw new BadRequestException('لا يمكن تغيير موقع جلسة جرد قائمة');
    return this.service.updateSession(id, body);
  }

  @Post(':id/items')
  @RequiresPermission('gym-sales.inventory.stock_taking:create')
  async addCountItem(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCountItemDto, @CurrentUser() user: JwtUser) {
    await this.service.findSession(id,user);
    return this.service.addCountItem(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.stock_taking:delete')
  async removeSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.service.findSession(id,user);
    return this.service.removeSession(id);
  }
}
