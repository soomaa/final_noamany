import {
  Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ListStockDto, StockSettingsDto, StockUpdateDto } from './dto/inventory.dto';
import { StockService } from './stock.service';

@UseGuards(JwtAuthGuard)
@Controller('stock')
@RequiresPermission('gym-sales.inventory:view')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get()
  list(@Query() query: ListStockDto) {
    return this.service.list(query);
  }

  @Get('low-stock')
  lowStock(@Query('warehouseId') warehouseId?: string) {
    return this.service.lowStock(warehouseId ? Number(warehouseId) : undefined);
  }

  @Get('levels/:warehouseId')
  levels(@Param('warehouseId', ParseIntPipe) warehouseId: number) {
    return this.service.levelsByWarehouse(warehouseId);
  }

  @Get('product/:productId/warehouse/:warehouseId')
  byProductWarehouse(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
  ) {
    return this.service.byProductWarehouse(productId, warehouseId);
  }

  @Put('product/:productId/warehouse/:warehouseId')
  @RequiresPermission('gym-sales.inventory:update')
  updateProductWarehouse(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() body: StockUpdateDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.updateProductWarehouse(productId, warehouseId, body, userId);
  }

  @Put('product/:productId/warehouse/:warehouseId/settings')
  @RequiresPermission('gym-sales.inventory:update')
  updateSettings(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('warehouseId', ParseIntPipe) warehouseId: number,
    @Body() body: StockSettingsDto,
  ) {
    return this.service.updateSettings(productId, warehouseId, body);
  }
}
