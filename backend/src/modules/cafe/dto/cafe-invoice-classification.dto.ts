import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

export class CafeInvoiceClassificationDto {
  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cafeCategoryId!: number;
}
