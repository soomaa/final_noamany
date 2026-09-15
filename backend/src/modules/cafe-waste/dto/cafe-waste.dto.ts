import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const CAFE_WASTE_SOURCE_KINDS = ['inventory', 'cafe_product'] as const;
export type CafeWasteSourceKind = (typeof CAFE_WASTE_SOURCE_KINDS)[number];

const WASTE_UNITS = ['g', 'kg', 'oz', 'ml', 'L', 'fl_oz', 'piece', 'package'] as const;
const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListCafeWasteCatalogDto extends PaginationDto {
  @IsOptional() @IsIn(['all', 'raw_material', 'ready_product', 'prepared_product', 'packaging'])
  kind?: 'all' | 'raw_material' | 'ready_product' | 'prepared_product' | 'packaging';

  @IsOptional() @IsString() branchId?: string;
}

export class PreviewCafeWasteDto {
  @IsIn(CAFE_WASTE_SOURCE_KINDS)
  sourceKind!: CafeWasteSourceKind;

  @Type(() => Number) @IsInt() @Min(1)
  sourceId!: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  variantId?: number;

  @Type(() => Number) @IsInt() @Min(1)
  branchId!: number;

  @Type(() => Number) @IsNumber() @Min(0.001)
  quantity!: number;

  @IsIn(WASTE_UNITS)
  unit!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  packageId?: number;
}

export class CreateCafeWasteDto extends PreviewCafeWasteDto {
  @IsUUID()
  requestId!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  reasonId?: number;

  @IsOptional() @Transform(trimString) @IsString() @MinLength(2) @MaxLength(120)
  newReason?: string;

  @IsOptional() @Transform(trimString) @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean()
  allowNegative?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  shiftSessionId?: number;
}

export class ListCafeWasteRecordsDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) shiftSessionId?: number;
  @IsOptional() @IsString() reasonId?: string;
  @IsOptional() @IsIn(['all', 'active', 'reversed']) status?: string;
  @IsOptional() @Matches(DATE_ONLY_PATTERN) @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(DATE_ONLY_PATTERN) @IsDateString({ strict: true }) dateTo?: string;
}

export class CafeWasteAnalyticsDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Matches(DATE_ONLY_PATTERN) @IsDateString({ strict: true }) dateFrom?: string;
  @IsOptional() @Matches(DATE_ONLY_PATTERN) @IsDateString({ strict: true }) dateTo?: string;
}

export class CreateCafeWasteReasonDto {
  @Transform(trimString) @IsString() @MinLength(2) @MaxLength(120)
  name!: string;
}

export class UpdateCafeWasteReasonDto {
  @IsOptional() @Transform(trimString) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ReverseCafeWasteDto {
  @Transform(trimString) @IsString() @MinLength(3) @MaxLength(500)
  reason!: string;
}

