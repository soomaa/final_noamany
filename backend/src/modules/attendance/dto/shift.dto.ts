import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

/**
 * Different times for one weekday (e.g. Friday opens at 10:00). weekday = JS getDay():
 * 0=Sunday … 5=Friday, 6=Saturday. All six times are required, like the shift itself.
 */
export class ShiftDayOverrideDto {
  @Type(() => Number)
  @IsInt({ message: 'اليوم غير صالح' })
  @Min(0, { message: 'اليوم غير صالح' })
  @Max(6, { message: 'اليوم غير صالح' })
  weekday!: number;

  @IsNotEmpty({ message: 'بداية الحضور حقل مطلوب' })
  @IsString()
  hdoorFromTime!: string;

  @IsNotEmpty({ message: 'نهاية الحضور حقل مطلوب' })
  @IsString()
  hdoorToTime!: string;

  @IsNotEmpty({ message: 'بداية الخصم حقل مطلوب' })
  @IsString()
  hdoorKhasmFrom!: string;

  @IsNotEmpty({ message: 'بداية الانصراف حقل مطلوب' })
  @IsString()
  ensrafFromTime!: string;

  @IsNotEmpty({ message: 'نهاية الانصراف حقل مطلوب' })
  @IsString()
  ensrafToTime!: string;

  @IsNotEmpty({ message: 'احتساب الاضافى حقل مطلوب' })
  @IsString()
  ensrafKhasmFrom!: string;
}

/**
 * Shift definition (tbl_hdodr_setting). Mirrors legacy Dwam_settings::add_dwam_setting /
 * update_dwam with all 7 fields. Times are stored in `h:i A` format (e.g. "08:00 AM"),
 * matching Dwam_model::insert_dwam_setting (date("h:i A", strtotime(...))).
 */
export class UpsertShiftDto {
  /** legacy `name` -> column `title` */
  @IsOptional()
  @IsString()
  title?: string;

  @IsNotEmpty({ message: 'بداية الحضور حقل مطلوب' })
  @IsString()
  hdoorFromTime!: string;

  @IsNotEmpty({ message: 'نهاية الحضور حقل مطلوب' })
  @IsString()
  hdoorToTime!: string;

  /** بداية الخصم (grace / late-deduction start) */
  @IsNotEmpty({ message: 'بداية الخصم حقل مطلوب' })
  @IsString()
  hdoorKhasmFrom!: string;

  @IsNotEmpty({ message: 'بداية الانصراف حقل مطلوب' })
  @IsString()
  ensrafFromTime!: string;

  @IsNotEmpty({ message: 'نهاية الانصراف حقل مطلوب' })
  @IsString()
  ensrafToTime!: string;

  /** احتساب الاضافى (overtime-start / early-leave threshold) */
  @IsNotEmpty({ message: 'احتساب الاضافى حقل مطلوب' })
  @IsString()
  ensrafKhasmFrom!: string;

  /**
   * Optional per-weekday times. When sent (even as []), it replaces the shift's overrides;
   * when omitted, existing overrides are left untouched (older clients / mobile).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ShiftDayOverrideDto)
  dayOverrides?: ShiftDayOverrideDto[];
}
