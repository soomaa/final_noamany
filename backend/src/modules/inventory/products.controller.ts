import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { ListProductsDto, UpdateProductStockDto, UpsertProductDto, BulkImportProductsDto, BulkUpdateProductsDto } from './dto/inventory.dto';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard)
@Controller('products')
@RequiresPermission(
  'gym-sales.inventory.raw_materials:view',
  'gym-sales.inventory.dashboard:view',
  'gym-sales.inventory.gym_issue:view',
  'gym-sales.inventory.stock_taking:view',
  'club.cafe.products:view',
  'club.cafe.price_list:view',
  'gym-sales.procurement.suppliers:view',
  'gym-sales.procurement.cafe_purchases:view',
)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('search')
  search(@CurrentUser() user: JwtUser, @Query('q') q?: string, @Query('search') search?: string) {
    return this.service.search(q ?? search ?? '', user);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.lowStock(branchId, user);
  }

  @Get('export')
  @RequiresPermission('gym-sales.inventory.raw_materials:export')
  exportList(@Query() query: ListProductsDto, @CurrentUser() user: JwtUser) {
    return this.service.exportList(query, user);
  }

  @Post('import')
  @RequiresPermission('gym-sales.inventory.raw_materials:create')
  bulkImport(@Body() body: BulkImportProductsDto, @CurrentUser() user: JwtUser) {
    return this.service.bulkImport(body.products, user.sub, user.branch);
  }

  @Post('bulk-update')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  bulkUpdate(@Body() body: BulkUpdateProductsDto) {
    return this.service.bulkUpdate(body.productIds, body.updates);
  }

  @Get(':id/inventory')
  productInventory(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.productInventory(id, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.inventory.raw_materials:create', 'club.cafe.products:create')
  create(@Body() body: UpsertProductDto, @CurrentUser() user: JwtUser) {
    const openingBranchId = user.branch > 0 && user.level !== 1
      ? user.branch
      : body.openingBranchId ?? user.branch;
    return this.service.create(body, user.sub, openingBranchId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertProductDto>) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertProductDto>) {
    return this.service.update(id, body);
  }

  @Put(':id/stock')
  @RequiresPermission('gym-sales.inventory.raw_materials:update')
  updateStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateProductStockDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateStock(id, body, user.sub, user);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.inventory.raw_materials:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/restore')
  @RequiresPermission('gym-sales.inventory.raw_materials:update', 'gym-sales.inventory.raw_materials:create')
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.service.restore(id);
  }
}
