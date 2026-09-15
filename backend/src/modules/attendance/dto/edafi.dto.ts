import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Shift swap / extra shift (tbl_emps_shef_edafi). Mirrors Api::add_sheft_edafi
 * + Hdoor_m::add_emp_sheft. ttype 1 = تبديل شيفت, 2 = اضافة شيفت.
 */
export class CreateShiftSwapDto {
  /** employee being assigned the swap/extra shift (employees.id) */
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'الموظف حقل مطلوب' })
  empId!: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'نوع العملية حقل مطلوب' })
  @IsIn([1, 2], { message: 'نوع الشيفت غير صالح' })
  ttype!: number;

  /** tbl_hdodr_setting.id */
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'الشيفت حقل مطلوب' })
  dwamIdFk!: number;

  @IsNotEmpty({ message: 'تاريخ الشيفت حقل مطلوب' })
  @IsString()
  sheftDate!: string;
}

/**
 * Extra hours (tbl_emps_hours_edafi). Mirrors Api::add_hours_edafi.
 */
export class CreateExtraHoursDto {
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'الموظف حقل مطلوب' })
  empId!: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'عدد الساعات حقل مطلوب' })
  @Min(1, { message: 'عدد الساعات غير صالح' })
  numHours!: number;

  @IsNotEmpty({ message: 'تاريخ الشيفت حقل مطلوب' })
  @IsString()
  edafaDate!: string;
}

/** List query for swap / extra-hours lists + their reports. */
export class ListEdafiDto extends PaginationDto {
  @IsOptional()
  @IsString()
  empCode?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
