import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateClubDiscountCodeDto {
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  code!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClubDiscountCodeDto {
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  code?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  isActive?: boolean;
}

