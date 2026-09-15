import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  MaxLength,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListProductsDto extends PaginationDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() brandId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsIn(['general', 'raw_material', 'ready_product', 'manufactured_internal', 'all']) inventoryKind?: string;
  @IsOptional() @IsIn(['general', 'preparation_ingredients', 'serving_packaging', 'gym_operations', 'ready_products', 'all']) inventorySection?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean() recipeIngredient?: boolean;
  @IsOptional() @IsIn(['active', 'inactive', 'archived', 'all']) status?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean() includeArchived?: boolean;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsBoolean() lowStock?: boolean;
}

export class ListCategoriesDto extends PaginationDto {
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListMainCategoriesDto extends PaginationDto {
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListSubCategoriesDto extends PaginationDto {
  @IsOptional() @IsString() mainCategoryId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListBrandsDto extends PaginationDto {
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListManufacturersDto extends PaginationDto {
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListSuppliersDto extends PaginationDto {
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListWarehousesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListStoragesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
}

export class ListStockDto extends PaginationDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() lowStock?: boolean;
}

export class ListProductBranchesDto extends PaginationDto {
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class ListInventoryTransactionsDto extends PaginationDto {
  @IsOptional() @IsString() txnType?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ListInventoryMovementsDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() txnType?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ListOpeningStocksDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
}

export class ListStockTakingDto extends PaginationDto {
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsString() status?: string;
}

export class ListSparePartsDto extends PaginationDto {
  @IsOptional() @IsString() mainCategoryId?: string;
  @IsOptional() @IsString() subCategoryId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() lowStock?: boolean;
}

export class ListConsumablesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() lowStock?: boolean;
}

export class ListCompositeProductsDto extends PaginationDto {
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListUnitTemplatesDto extends PaginationDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) status?: string;
}

export class ListServiceConsumablesDto extends PaginationDto {
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() consumableId?: string;
}

export class ProductRecipeLineDto {
  @IsInt() ingredientId!: number;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsString() unit!: string;
}

export class PackagedMaterialSizeDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsNumber() @Min(0.001) packageSize!: number;
  @IsIn(['g', 'kg', 'oz', 'ml', 'L', 'fl_oz', 'piece']) packageUnit!: string;
  @IsNumber() @Min(0.01) packagePrice!: number;
  @IsOptional() @IsNumber() @Min(0) initialPackageCount?: number;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
}

export class UpsertProductDto {
  @IsOptional() @IsString() productCode?: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsInt() manufacturerId?: number;
  @IsOptional() @IsInt() supplierId?: number;
  @IsOptional() @IsIn(['general', 'raw_material', 'ready_product', 'manufactured_internal']) inventoryKind?: string;
  @IsOptional() @IsIn(['general', 'preparation_ingredients', 'serving_packaging', 'gym_operations', 'ready_products']) inventorySection?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  /** Total acquisition cost of the opening quantity. Unit cost is derived server-side. */
  @IsOptional() @IsNumber() @Min(0) initialTotalCost?: number;
  @IsOptional() @IsNumber() @Min(0) initialStock?: number;
  @IsOptional() @IsInt() @Min(1) openingBranchId?: number;
  @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @IsOptional() @IsNumber() @Min(0) wholesalePrice?: number;
  @IsOptional() @IsString() unitOfMeasure?: string;
  @IsOptional() @IsInt() unitTemplateId?: number;
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsBoolean() isPackaged?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackagedMaterialSizeDto)
  packages?: PackagedMaterialSizeDto[];
  @IsOptional() @IsString() material?: string;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() dimensions?: Record<string, unknown>;
  @IsOptional() @IsString() warrantyPeriod?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() batchNumber?: string;
  @IsOptional() @IsString() shelfLocation?: string;
  @IsOptional() @IsBoolean() applyToAllBranches?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  /** BOM for manufactured_internal (composite / sub-recipe) ingredients. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductRecipeLineDto)
  recipes?: ProductRecipeLineDto[];
}

export class UpdateProductStockDto {
  @IsNumber() quantity!: number;
  @IsIn(['add', 'subtract', 'set']) operation!: 'add' | 'subtract' | 'set';
  @IsOptional() @IsInt() warehouseId?: number;
}

export class BulkImportProductsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => UpsertProductDto)
  products!: UpsertProductDto[];
}

export class BulkUpdateProductsDto {
  @IsArray() @IsInt({ each: true }) productIds!: number[];
  @ValidateNested() @Type(() => UpsertProductDto)
  updates!: Partial<UpsertProductDto>;
}

export class UpsertCategoryDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() @MaxLength(32) emoji?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() parentCategoryId?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCategoryStatusDto {
  @IsBoolean() isActive!: boolean;
}

export class UpdateCategoryOrderDto {
  @IsArray()
  @IsInt({ each: true })
  categoryIds!: number[];
}

export class UpsertMainCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertSubCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() mainCategoryId!: number;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertBrandDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertManufacturerDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertSupplierDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierPhoneDto)
  phones?: SupplierPhoneDto[];
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() taxNumber?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() rating?: number;
  @IsOptional()
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number).filter((id) => Number.isInteger(id) && id > 0) : undefined)
  @IsArray()
  @IsInt({ each: true })
  productIds?: number[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSupplierDto extends PartialType(UpsertSupplierDto) {}

export class SupplierPhoneDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Matches(/^\+?[0-9][0-9\s()-]{5,24}$/, { message: 'رقم الهاتف غير صالح' })
  phone!: string;

  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpsertWarehouseDto {
  @IsOptional() @IsString() warehouseCode?: string;
  @IsString() nameAr!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsIn(['main', 'sub']) type?: 'main' | 'sub';
  @IsOptional() @IsInt() storageCapacity?: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsString() managerName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

export class UpsertStorageDto {
  @IsString() name!: string;
  @IsInt() branchId!: number;
  @IsString() email!: string;
  @IsOptional() @IsString() imageAttachment?: string;
  @IsOptional() @IsString() licenceAttachment?: string;
  @IsOptional() @IsString() safetyCertAttachment?: string;
  @IsOptional() @IsString() plansAttachment?: string;
  @IsOptional() @IsString() reportsAttachment?: string;
  @IsOptional() @IsString() otherAttachment?: string;
}

export class StorageProductDto {
  @IsInt() productId!: number;
  @IsNumber() quantity!: number;
}

export class StockUpdateDto {
  @IsNumber() quantity!: number;
  @IsIn(['add', 'subtract', 'set']) operation!: 'add' | 'subtract' | 'set';
  @IsOptional() @IsBoolean() allowNegative?: boolean;
}

export class StockSettingsDto {
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsString() shelfLocation?: string;
}

export class UpsertProductBranchDto {
  @IsInt() productId!: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsNumber() stockQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
}

export class UpdateProductBranchStockDto {
  @IsNumber() stockQuantity!: number;
}

export class TransactionItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsString() itemCode?: string;
  @IsString() itemName!: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() total?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpsertInventoryTransactionDto {
  @IsString() reference!: string;
  @IsString() txnType!: string;
  @IsDateString() txnDate!: string;
  @IsInt() branchId!: number;
  @IsOptional() @IsInt() sourceWarehouseId?: number;
  @IsOptional() @IsInt() targetWarehouseId?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() reason?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TransactionItemDto) items!: TransactionItemDto[];
}

export class RejectTransactionDto {
  @IsString() reason!: string;
}

export class UpsertOpeningStockDto {
  @IsOptional() @IsDateString() openingStockDate?: string;
  @IsString() itemCode!: string;
  @IsNumber() quantity!: number;
  @IsNumber() unitCost!: number;
  @IsOptional() @IsNumber() totalCost?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsInt() sparePartId?: number;
}

export class UpsertCountSessionDto {
  @IsOptional() @IsString() sessionNumber?: string;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpsertCountItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsString() itemCode?: string;
  @IsString() itemName!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() systemQuantity?: number;
  @IsNumber() @Min(0) countedQuantity!: number;
  @IsOptional() @IsString() @MaxLength(255) varianceReason?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpsertSparePartDto {
  @IsOptional() @IsString() partCode?: string;
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsInt() mainCategoryId!: number;
  @IsInt() subCategoryId!: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsInt() supplierId?: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsIn(['new', 'used', 'refurbished']) partCondition?: 'new' | 'used' | 'refurbished';
  @IsOptional() @IsNumber() costPrice?: number;
  @IsOptional() @IsNumber() sellingPrice?: number;
  @IsOptional() @IsNumber() currentStock?: number;
  @IsOptional() @IsInt() minStock?: number;
  @IsOptional() @IsString() warrantyPeriod?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

export class UpsertConsumableDto {
  @IsOptional() @IsString() code?: string;
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsInt() supplierId?: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() brandId?: number;
  @IsOptional() @IsInt() unitTemplateId?: number;
  @IsNumber() consumptionRate!: number;
  @IsNumber() unitCost!: number;
  @IsOptional() @IsNumber() currentStock?: number;
  @IsOptional() @IsInt() minStock?: number;
  @IsOptional() @IsInt() maxStock?: number;
  @IsOptional() @IsString() shelfLocation?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetConsumableStockDto {
  @IsNumber() currentStock!: number;
}

export class CompositeItemDto {
  @IsInt() productId!: number;
  @IsNumber() @Min(0.001) quantity!: number;
}

export class UpsertCompositeProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CompositeItemDto) items!: CompositeItemDto[];
}

export class UnitConversionDto {
  @IsString() fromUnit!: string;
  @IsString() toUnit!: string;
  @IsNumber() factor!: number;
  @IsOptional() @IsString() formula?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpsertUnitTemplateDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() baseUnit?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UnitConversionDto) conversions?: UnitConversionDto[];
}

export class UpsertServiceConsumableDto {
  @IsInt() serviceId!: number;
  @IsInt() consumableId!: number;
  @IsOptional() @IsNumber() quantity?: number;
}

export class BatchServiceConsumableDto {
  @IsInt() serviceId!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => UpsertServiceConsumableDto) items!: UpsertServiceConsumableDto[];
}

export class UpdateWarehouseBalanceDto {
  @IsOptional() @IsNumber() @Min(0) minStock?: number;
  @IsOptional() @IsNumber() @Min(0) maxStock?: number;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsString() shelfLocation?: string;
}

export class DashboardSummaryQueryDto {
  @IsOptional() @IsString() branchId?: string;
}

export class DailyStockQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() warehouseId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['raw_material', 'ready_product', 'manufactured_internal', 'all']) inventoryKind?: string;
}

