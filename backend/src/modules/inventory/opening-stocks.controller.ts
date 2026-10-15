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
@RequiresPermission('gym-sales.inventory.raw_materials:view')
export class OpeningStocksController {
  constructor(private readonly service: OpeningStocksService) {}

  @Get()
  list(@Query() query: ListOpeningStocksDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('by-branch/:branchId')
  byBranch(@Param('branchId', ParseIntPipe) branchId: number, @CurrentUser() user: JwtUser) {
    return this.service.byBranch(branchId, user);
  }

  @Get('by-warehouse/:warehouseId')
  byWarehouse(@Param('warehouseId', ParseIntPipe) warehouseId: number, @CurrentUser() user: JwtUser) {
    return this.service.byWarehouse(warehouseId, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.raw_materials:create')
  create(
    @Body() body: UpsertOpeningStockDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.create(body, user, isDryRun(dryRun));
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertOpeningStockDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertOpeningStockDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
