import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import {
  ListProductBranchesDto,
  UpdateProductBranchStockDto,
  UpsertProductBranchDto,
} from './dto/inventory.dto';
import { ProductBranchesService } from './product-branches.service';

@UseGuards(JwtAuthGuard)
@Controller('product-branches')
@RequiresPermission('gym-sales.inventory:view')
export class ProductBranchesController {
  constructor(private readonly service: ProductBranchesService) {}

  @Get()
  list(@Query() query: ListProductBranchesDto) {
    return this.service.list(query);
  }

  @Get('by-branch/:branchId/products')
  byBranchProducts(@Param('branchId', ParseIntPipe) branchId: number) {
    return this.service.byBranchProducts(branchId);
  }

  @Get('by-branch/:branchId/low-stock')
  byBranchLowStock(@Param('branchId', ParseIntPipe) branchId: number) {
    return this.service.byBranchLowStock(branchId);
  }

  @Get('by-product/:productId/branches')
  byProductBranches(@Param('productId', ParseIntPipe) productId: number) {
    return this.service.byProductBranches(productId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory:create')
  create(@Body() body: UpsertProductBranchDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertProductBranchDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id/stock')
  @RequiresPermission('gym-sales.inventory:update')
  updateStock(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProductBranchStockDto) {
    return this.service.updateStock(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
