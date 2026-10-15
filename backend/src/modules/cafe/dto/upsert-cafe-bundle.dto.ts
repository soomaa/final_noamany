import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CafeBundleOptionDto {
  @IsInt()
  cafeProductId!: number;

  @IsOptional()
  @IsInt()
  cafeVariantId?: number | null;

  /** Extra charge (fixed mode) or extra list value (percent mode) for this choice. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceDelta?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CafeBundleGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  /** How many options the customer must pick from this group (default exactly 1). */
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CafeBundleOptionDto)
  options!: CafeBundleOptionDto[];
}

export class UpsertCafeBundleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bundleCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsIn(['fixed', 'percent'])
  pricingMode!: 'fixed' | 'percent';

  /** Required when pricingMode = 'fixed'. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedPrice?: number;

  /** Required when pricingMode = 'percent'. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CafeBundleGroupDto)
  groups!: CafeBundleGroupDto[];
}
