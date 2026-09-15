import { IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';

/**
 * Penalty amount (geza_value) is stored as a STRING in hr_gezaat and summed by the
 * engine via CAST(geza_value AS DECIMAL). A negative value would become a negative
 * deduction — i.e. it would ADD to the employee's pay (unbounded-bonus exploit).
 * Enforce a non-negative numeric string: digits with an optional decimal part, no
 * sign / no leading minus.
 */
const NON_NEGATIVE_MONEY = /^\d+(\.\d+)?$/;
const NON_NEGATIVE_MONEY_MSG = 'قيمة الجزاء يجب أن تكون رقمًا موجبًا';

export class CreatePenaltyDto {
  @IsInt()
  empId!: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  @Matches(NON_NEGATIVE_MONEY, { message: NON_NEGATIVE_MONEY_MSG })
  amount!: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsInt()
  @IsIn([1, 2])
  gezaType!: number;

  /** penalty_bylaws.id — when set, amount is pulled from the bylaw. */
  @IsOptional()
  @IsInt()
  bylawId?: number;
}

export class UpdatePenaltyDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_MONEY, { message: NON_NEGATIVE_MONEY_MSG })
  amount?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  gezaType?: number;
}

export class CreateBylawDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsInt()
  deductionDays?: number;

  @IsOptional()
  @IsInt()
  deductionAmount?: number;
}

export class UpdateBylawDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  actionType?: string;

  @IsOptional()
  @IsInt()
  deductionDays?: number;

  @IsOptional()
  @IsInt()
  deductionAmount?: number;

  @IsOptional()
  @IsInt()
  isActive?: number;
}
