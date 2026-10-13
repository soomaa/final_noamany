import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { SalesPaymentMethod } from '@prisma/client';

export class SellCafeProductDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  branchId!: number;

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  cafeCategoryId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  warehouseId?: number;

  @IsOptional()
  @IsEnum(SalesPaymentMethod)
  paymentMethod?: SalesPaymentMethod;
}
