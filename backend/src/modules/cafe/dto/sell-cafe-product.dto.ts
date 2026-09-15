import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { SalesPaymentMethod } from '@prisma/client';

export class SellCafeProductDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;

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
}
