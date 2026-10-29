import {
  Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListStockDto, StockSettingsDto, StockUpdateDto } from './dto/inventory.dto';
import { StockService } from './stock.service';

@UseGuards(JwtAuthGuard)
@Controller('stock')
@RequiresPermission('gym-sales.inventory:view')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get()
  list(@Query() query: ListStockDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: JwtUser, @Query('warehouseId') warehouseId?: string) {
    return this.service.lowStock(user, warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('levels/:warehouseId')
  levels(@Param('warehouseId', ParseIntPipe) warehouseId: number, @CurrentUser() user: JwtUser) {
    return this.service.levelsByWarehouse(warehouseId, user);
  }

  @Get('product/:productId/warehouse/:warehouseId')
  byProductWarehouse(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.byProductWarehouse(productId, warehouseId, user);
  }

  @Put('product/:productId/warehouse/:warehouseId')
  @RequiresPermission('gym-sales.inventory:update')
  updateProductWarehouse(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() body: StockUpdateDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateProductWarehouse(productId, warehouseId, body, user);
  }

  @Put('product/:productId/warehouse/:warehouseId/settings')
  @RequiresPermission('gym-sales.inventory:update')
  updateSettings(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() body: StockSettingsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateSettings(productId, warehouseId, body, user);
  }
}
