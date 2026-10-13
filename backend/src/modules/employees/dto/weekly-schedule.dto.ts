import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class WeeklyScheduleSlotDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shiftId?: number | null;
}

export class PutWeeklyScheduleDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleSlotDto)
  slots!: WeeklyScheduleSlotDto[];
}
