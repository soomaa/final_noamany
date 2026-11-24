import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

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

export class OvertimeActionDto {
  @IsString()
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class ListOvertimeRequestsDto extends PaginationDto {
  /** sader = my requests, wared = waiting for my decision, all/empty = branch board (web). */
  @IsOptional()
  @IsIn(['sader', 'wared', 'all'])
  mode?: 'sader' | 'wared' | 'all';

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
}
