import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
