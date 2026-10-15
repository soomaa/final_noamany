import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';

/** One chosen option inside a bundle group, picked by the customer at sale time. */
export class BundleSelectionOptionDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  groupId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  cafeProductId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  cafeVariantId?: number;
}

/** A bundle added to a café cart, with the customer's choices per group. */
export class SellBundleLineDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  bundleId!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleSelectionOptionDto)
  selections!: BundleSelectionOptionDto[];
}
