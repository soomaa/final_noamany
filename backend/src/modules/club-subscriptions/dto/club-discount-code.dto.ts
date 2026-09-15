import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

  @IsOptional()
  @Transform(({ value }) => value === '' || value == null ? null : Number(value))
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @Matches(datePattern)
  validFrom?: string | null;

  @IsOptional()
  @Matches(datePattern)
  validTo?: string | null;

  @IsOptional()
  @IsIn(['all_users', 'specific_users'])
  audience?: 'all_users' | 'specific_users';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  memberIds?: number[];
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

  @IsOptional()
  @Transform(({ value }) => value === '' || value == null ? null : Number(value))
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @Matches(datePattern)
  validFrom?: string | null;

  @IsOptional()
  @Matches(datePattern)
  validTo?: string | null;

  @IsOptional()
  @IsIn(['all_users', 'specific_users'])
  audience?: 'all_users' | 'specific_users';

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  memberIds?: number[];
}
