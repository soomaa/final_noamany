import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CafeRecipeRowDto {
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  id?: number;

  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  ingredientId!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsIn(['g', 'kg', 'oz', 'ml', 'L', 'fl_oz', 'piece'])
  unit!: 'g' | 'kg' | 'oz' | 'ml' | 'L' | 'fl_oz' | 'piece';
}

export class CafeProductVariantDto {
  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  id?: number;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  variantCode?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  sellPrice!: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CafeRecipeRowDto)
  recipes!: CafeRecipeRowDto[];
}

export class UpsertCafeProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['ready', 'prepared', 'internal'])
  productType?: 'ready' | 'prepared' | 'internal';

  @IsOptional()
  @IsIn(['protein', 'bar'])
  businessClassification?: 'protein' | 'bar';

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  inventoryProductId?: number;

  @IsOptional()
  @IsIn(['g', 'kg', 'oz', 'ml', 'L', 'fl_oz', 'piece'])
  readyUnit?: 'g' | 'kg' | 'oz' | 'ml' | 'L' | 'fl_oz' | 'piece';

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  readyMinStock?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  initialStock?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  initialCost?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  initialTotalCost?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  openingBranchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  categoryId?: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0, { message: 'سعر البيع لا يمكن أن يكون سالبًا' })
  sellPrice!: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CafeRecipeRowDto)
  recipes?: CafeRecipeRowDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CafeProductVariantDto)
  variants?: CafeProductVariantDto[];
}
