import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsInt } from 'class-validator';

export class MarkCafeProductsUnavailableDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
  @IsInt({ each: true })
  productIds!: number[];
}
