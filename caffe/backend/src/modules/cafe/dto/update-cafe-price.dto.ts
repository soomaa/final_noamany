import { Transform } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateCafePriceDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  sellPrice!: number;
}
