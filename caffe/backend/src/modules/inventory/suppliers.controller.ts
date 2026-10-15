import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListSuppliersDto, UpdateSupplierDto, UpsertSupplierDto } from './dto/inventory.dto';
import { SuppliersService } from './suppliers.service';

@UseGuards(JwtAuthGuard)
@Controller('suppliers')
@RequiresPermission(
  'gym-sales.procurement.suppliers:view',
  'gym-sales.procurement.cafe_purchases:view',
  'gym-sales.inventory.raw_materials:view',
)
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/products')
  products(
    @Param('id', ParseIntPipe) id: number,
    @Query('warehouseId') warehouseId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.products(
      id,
      warehouseId ? Number(warehouseId) : undefined,
      branchId ? Number(branchId) : undefined,
    );
  }

  @Post()
  @RequiresPermission('gym-sales.procurement.suppliers:create')
  create(@Body() body: UpsertSupplierDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement.suppliers:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSupplierDto) {
    return this.service.update(id, body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.procurement.suppliers:update')
  patch(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSupplierDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement.suppliers:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
