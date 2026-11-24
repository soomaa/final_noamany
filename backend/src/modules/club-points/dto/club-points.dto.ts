import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class SavePointsConversionDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  points!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  value!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  validityDays!: number;
}

export class SavePointsEarnSettingDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  type!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  points!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  expireDays!: number;
}

export class UpdatePointsEarnSettingDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  points!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  expireDays!: number;
}

export class PointsDateRangeQueryDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @IsIn(['all', 'male', 'female'])
  gender?: string;
}
