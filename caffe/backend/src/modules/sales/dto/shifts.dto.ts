import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class ListShiftsDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
}

export class ShiftRevenueQueryDto {
  @IsDateString() date!: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}

export class CreateShiftDto {
  @IsString() @MinLength(1) @MaxLength(100) shiftName!: string;
  @IsString() @Matches(TIME_RE) startTime!: string;
  @IsString() @Matches(TIME_RE) endTime!: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() responsibleUserId?: number;
  @IsOptional() @IsBoolean() isLastShiftOfDay?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) shiftName?: string;
  @IsOptional() @IsString() @Matches(TIME_RE) startTime?: string;
  @IsOptional() @IsString() @Matches(TIME_RE) endTime?: string;
  @IsOptional() @IsInt() branchId?: number | null;
  @IsOptional() @IsInt() responsibleUserId?: number | null;
  @IsOptional() @IsBoolean() isLastShiftOfDay?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CurrentShiftQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
