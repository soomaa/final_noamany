import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { isDryRun } from '../../common/preview';
import { ListOpeningStocksDto, UpsertOpeningStockDto } from './dto/inventory.dto';
import { OpeningStocksService } from './opening-stocks.service';

@UseGuards(JwtAuthGuard)
@Controller('opening-stocks')
@RequiresPermission('gym-sales.inventory:view')
export class OpeningStocksController {
  constructor(private readonly service: OpeningStocksService) {}

  @Get()
  list(@Query() query: ListOpeningStocksDto) {
    return this.service.list(query);
  }

  @Get('by-branch/:branchId')
  byBranch(@Param('branchId', ParseIntPipe) branchId: number) {
    return this.service.byBranch(branchId);
  }

  @Get('by-warehouse/:warehouseId')
  byWarehouse(@Param('warehouseId', ParseIntPipe) warehouseId: number) {
    return this.service.byWarehouse(warehouseId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(
    @Body() body: UpsertOpeningStockDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.create(body, user, isDryRun(dryRun));
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertOpeningStockDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertOpeningStockDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
