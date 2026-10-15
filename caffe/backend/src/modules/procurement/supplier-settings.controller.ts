import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import {
  ListPaymentTermsDto,
  ListSupplierCategoriesDto,
  ListSupplyRegionsDto,
  UpsertPaymentTermDto,
  UpsertSupplierCategoryDto,
  UpsertSupplyRegionDto,
} from './dto/procurement-ext.dto';
import { SupplierSettingsService } from './supplier-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-settings')
@RequiresPermission('gym-sales.procurement:view')
export class SupplierSettingsController {
  constructor(private readonly service: SupplierSettingsService) {}

  @Get('supplier-categories')
  listCategories(@Query() q: ListSupplierCategoriesDto) {
    return this.service.listCategories(q);
  }

  @Get('supplier-categories/active')
  listActiveCategories() {
    return this.service.listActiveCategories();
  }

  @Get('supplier-categories/:id')
  findCategory(@Param('id', ParseIntPipe) id: number) {
    return this.service.findCategory(id);
  }

  @Post('supplier-categories')
  @RequiresPermission('gym-sales.procurement:create')
  createCategory(@Body() body: UpsertSupplierCategoryDto) {
    return this.service.createCategory(body);
  }

  @Put('supplier-categories/:id')
  @RequiresPermission('gym-sales.procurement:update')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierCategoryDto>,
  ) {
    return this.service.updateCategory(id, body);
  }

  @Delete('supplier-categories/:id')
  @RequiresPermission('gym-sales.procurement:delete')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeCategory(id);
  }

  @Get('supply-regions')
  listRegions(@Query() q: ListSupplyRegionsDto) {
    return this.service.listRegions(q);
  }

  @Get('supply-regions/active')
  listActiveRegions() {
    return this.service.listActiveRegions();
  }

  @Get('supply-regions/:id')
  findRegion(@Param('id', ParseIntPipe) id: number) {
    return this.service.findRegion(id);
  }

  @Post('supply-regions')
  @RequiresPermission('gym-sales.procurement:create')
  createRegion(@Body() body: UpsertSupplyRegionDto) {
    return this.service.createRegion(body);
  }

  @Put('supply-regions/:id')
  @RequiresPermission('gym-sales.procurement:update')
  updateRegion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplyRegionDto>,
  ) {
    return this.service.updateRegion(id, body);
  }

  @Delete('supply-regions/:id')
  @RequiresPermission('gym-sales.procurement:delete')
  removeRegion(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeRegion(id);
  }

  @Get('payment-terms')
  listPaymentTerms(@Query() q: ListPaymentTermsDto) {
    return this.service.listPaymentTerms(q);
  }

  @Get('payment-terms/active')
  listActivePaymentTerms() {
    return this.service.listActivePaymentTerms();
  }

  @Get('payment-terms/:id')
  findPaymentTerm(@Param('id', ParseIntPipe) id: number) {
    return this.service.findPaymentTerm(id);
  }

  @Post('payment-terms')
  @RequiresPermission('gym-sales.procurement:create')
  createPaymentTerm(@Body() body: UpsertPaymentTermDto) {
    return this.service.createPaymentTerm(body);
  }

  @Put('payment-terms/:id')
  @RequiresPermission('gym-sales.procurement:update')
  updatePaymentTerm(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertPaymentTermDto>,
  ) {
    return this.service.updatePaymentTerm(id, body);
  }

  @Delete('payment-terms/:id')
  @RequiresPermission('gym-sales.procurement:delete')
  removePaymentTerm(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePaymentTerm(id);
  }
}
