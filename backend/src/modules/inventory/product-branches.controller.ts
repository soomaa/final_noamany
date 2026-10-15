import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  ListProductBranchesDto,
  UpdateProductBranchStockDto,
  UpsertProductBranchDto,
} from './dto/inventory.dto';
import { ProductBranchesService } from './product-branches.service';

@UseGuards(JwtAuthGuard)
@Controller('product-branches')
@RequiresPermission('gym-sales.inventory.raw_materials:view')
export class ProductBranchesController {
  constructor(private readonly service: ProductBranchesService) {}

  @Get()
  list(@Query() query: ListProductBranchesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('by-branch/:branchId/products')
  byBranchProducts(@Param('branchId', ParseIntPipe) branchId: number, @CurrentUser() user: JwtUser) {
    return this.service.byBranchProducts(branchId, user);
  }

  @Get('by-branch/:branchId/low-stock')
  byBranchLowStock(@Param('branchId', ParseIntPipe) branchId: number, @CurrentUser() user: JwtUser) {
    return this.service.byBranchLowStock(branchId, user);
  }

  @Get('by-product/:productId/branches')
  byProductBranches(@Param('productId', ParseIntPipe) productId: number, @CurrentUser() user: JwtUser) {
    return this.service.byProductBranches(productId, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.raw_materials:create')
  create(@Body() body: UpsertProductBranchDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertProductBranchDto>, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/stock')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  updateStock(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProductBranchStockDto, @CurrentUser() user: JwtUser) {
    return this.service.updateStock(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
