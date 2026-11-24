import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const toNumber = ({ value }: { value: unknown }) => (value === '' || value == null ? undefined : Number(value));

/** Employee overtime request (طلب ساعات إضافية): web form and mobile app. */
export class CreateOvertimeRequestDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'تاريخ الإضافي مطلوب (YYYY-MM-DD)' })
  date!: string;

  /** Whole hours — tbl_emps_hours_edafi.num_hours is an integer column. */
  @Transform(({ value }) => (value === '' || value == null ? value : Number(value)))
  @IsInt({ message: 'عدد الساعات يجب أن يكون رقمًا صحيحًا' })
  @Min(1, { message: 'عدد الساعات غير صالح' })
  @Max(12, { message: 'عدد الساعات لا يتجاوز 12 ساعة' })
  hours!: number;

  @IsString({ message: 'السبب مطلوب' })
  @MaxLength(500)
  reason!: string;

  /** Web only: a manager / HR filing for an employee in their branch scope. Ignored on mobile. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  empId?: number;
}

/**
 * A direct manager entering overtime (or an extra shift) for one of his team. It is NOT recorded:
 * it becomes a request that starts at the HR step. HR / admin entries are recorded directly
 * (auto-approved, logged).
 */
export class ManagerOvertimeDto {
  @Transform(toNumber)
  @IsInt({ message: 'الموظف حقل مطلوب' })
  empId!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'التاريخ مطلوب (YYYY-MM-DD)' })
  date!: string;

  /** hours = ساعات إضافية (tbl_emps_hours_edafi), shift = شيفت إضافي (tbl_emps_shef_edafi ttype 2). */
  @IsOptional()
  @IsIn(['hours', 'shift'])
  kind?: 'hours' | 'shift';

  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'عدد الساعات يجب أن يكون رقمًا صحيحًا' })
  @Min(1, { message: 'عدد الساعات غير صالح' })
  @Max(12, { message: 'عدد الساعات لا يتجاوز 12 ساعة' })
  hours?: number;

  /** tbl_hdodr_setting.id — required for kind=shift. */
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  shiftId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OvertimeActionDto {
  @IsString()
  @IsIn(['accept', 'reject', 'return'])
  action!: 'accept' | 'reject' | 'return';

  /** Decision note; required for `return` (the comment the requester sees). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  /** Alias of `reason` (mobile). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Edit + resubmit of a returned request (every field optional: unchanged when omitted). */
export class ResubmitOvertimeDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'التاريخ غير صالح (YYYY-MM-DD)' })
  date?: string;

  @IsOptional()
  @IsIn(['hours', 'shift'])
  kind?: 'hours' | 'shift';

  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'عدد الساعات يجب أن يكون رقمًا صحيحًا' })
  @Min(1, { message: 'عدد الساعات غير صالح' })
  @Max(12, { message: 'عدد الساعات لا يتجاوز 12 ساعة' })
  hours?: number;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  shiftId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Reply to the return comment, shown in the timeline. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class OvertimePreviewDto {
  @Transform(toNumber)
  @IsInt({ message: 'الموظف حقل مطلوب' })
  empId!: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'التاريخ مطلوب (YYYY-MM-DD)' })
  date!: string;
}

export class ListOvertimeRequestsDto extends PaginationDto {
  /** sader = my requests, wared = waiting for my decision, all/empty = branch board (web). */
  @IsOptional()
  @IsIn(['sader', 'wared', 'all'])
  mode?: 'sader' | 'wared' | 'all';

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled', 'returned'])
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'returned';

  /** employee = filed by the employee, manager = entered by a direct manager. */
  @IsOptional()
  @IsIn(['employee', 'manager'])
  source?: 'employee' | 'manager';
}
