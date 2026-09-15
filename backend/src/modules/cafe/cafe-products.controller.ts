import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { isDryRun } from '../../common/preview';
import { CafeProductsService } from './cafe-products.service';
import { UpsertCafeProductDto } from './dto/upsert-cafe-product.dto';
import { SellCafeProductDto } from './dto/sell-cafe-product.dto';
import { SellCafeCartDto } from './dto/sell-cafe-cart.dto';
import { UpsertCafePartnerDto } from './dto/upsert-cafe-partner.dto';
import { UpdateCafePriceDto } from './dto/update-cafe-price.dto';
import { ProduceCafeProductDto } from './dto/produce-cafe-product.dto';
import { MarkCafeProductsUnavailableDto } from './dto/mark-cafe-products-unavailable.dto';
import { UpdateCafeProductStatusDto } from './dto/update-cafe-product-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('cafe-products')
@RequiresPermission(
  'club.cafe.products:view',
  'club.cafe.price_list:view',
  'gym-sales.sales.new_receipt:view',
)
export class CafeProductsController {
  constructor(private readonly service: CafeProductsService) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('branchId') branchId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('sellableOnly') sellableOnly?: string,
    @Query('isActive') isActive?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    const p = Math.max(1, Number(page ?? 1));
    const ps = Math.max(1, Math.min(100, Number(pageSize ?? 20)));
    return this.service.list({
      skip: (p - 1) * ps,
      take: ps,
      search,
      categoryId: categoryId ? Number(categoryId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      sellableOnly: sellableOnly === 'true',
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    }, user);
  }

  @Get('next-code')
  @RequiresPermission('club.cafe.products:create')
  nextCode() {
    return this.service.nextProductCode();
  }

  @Get('partners/list')
  partners() {
    return this.service.partners();
  }

  @Post('partners')
  @RequiresPermission('hr.partners:create')
  createPartner(@Body() body: UpsertCafePartnerDto) {
    return this.service.createPartner(body);
  }

  @Put('partners/:id')
  @RequiresPermission('hr.partners:update')
  updatePartner(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCafePartnerDto) {
    return this.service.updatePartner(id, body);
  }

  @Get('reports/summary')
  @RequiresPermission('club.cafe.reports:view')
  reports(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('shiftSessionId') shiftSessionId: string | undefined,
    @Query('section') section: 'protein' | 'bar' | 'management_withdrawals' | undefined,
    @Query('gender') gender: 'male' | 'female' | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reports(dateFrom, dateTo, branchId, user, shiftSessionId, section, gender);
  }

  @Get('reports/item-feedback')
  @RequiresPermission('club.cafe.feedback_reports:view')
  itemFeedbackReport(
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @Query('gender') gender: 'male' | 'female' | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.itemFeedbackReport(dateFrom, dateTo, branchId, user, gender);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.cafe.products:create')
  create(@Body() body: UpsertCafeProductDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.cafe.products:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCafeProductDto) {
    return this.service.update(id, body);
  }

  @Patch(':id/price')
  @RequiresPermission('club.cafe.price_list:update')
  updatePrice(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCafePriceDto) {
    return this.service.updatePrice(id, body.sellPrice);
  }

  @Patch(':id/status')
  @RequiresPermission('club.cafe.products:update')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCafeProductStatusDto,
  ) {
    return this.service.updateStatus(id, body.isActive);
  }

  @Post('by-inventory/:inventoryProductId/produce')
  @RequiresPermission('club.cafe.products:update', 'gym-sales.inventory.raw_materials:update')
  produceByInventory(
    @Param('inventoryProductId', ParseIntPipe) inventoryProductId: number,
    @Body() body: ProduceCafeProductDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.produceByInventoryProduct(inventoryProductId, body, userId);
  }

  @Post('availability/unavailable')
  @RequiresPermission('gym-sales.sales.new_receipt:create')
  markUnavailableForSale(@Body() body: MarkCafeProductsUnavailableDto) {
    return this.service.markUnavailableForSale(body.productIds);
  }

  @Delete(':id')
  @RequiresPermission('club.cafe.products:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/produce')
  @RequiresPermission('club.cafe.products:update')
  produce(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ProduceCafeProductDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.produce(id, body, userId);
  }

  @Post('sell-cart')
  @RequiresPermission('gym-sales.sales.new_receipt:create')
  sellCart(
    @Body() body: SellCafeCartDto,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.sellCart(body, userId, isDryRun(dryRun));
  }

  @Post(':id/sell')
  @RequiresPermission('gym-sales.sales.new_receipt:create')
  sell(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SellCafeProductDto,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.sell(id, body, userId, isDryRun(dryRun));
  }
}
