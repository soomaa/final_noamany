import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { SalesPaymentMethod } from '@prisma/client';

export class CafeCartLineDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  productId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  variantId?: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class SellCafeCartDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  branchId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  warehouseId?: number;

  @IsOptional()
  @IsEnum(SalesPaymentMethod)
  paymentMethod?: SalesPaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CafeCartLineDto)
  items!: CafeCartLineDto[];
}
