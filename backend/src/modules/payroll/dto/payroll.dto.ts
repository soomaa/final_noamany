import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePayComponentDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsIn(['earning', 'allowance', 'deduction'])
  category!: 'earning' | 'allowance' | 'deduction';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  isActive?: boolean;
}

export class UpdatePayComponentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['earning', 'allowance', 'deduction'])
  category?: 'earning' | 'allowance' | 'deduction';

  @IsOptional()
  amount?: number;

  @IsOptional()
  isActive?: boolean;
}

export class MonthlyPayrollEventDto {
  @IsIn(['deduction', 'increase', 'bonus', 'evaluation', 'target', 'reversal'])
  kind!: 'deduction' | 'increase' | 'bonus' | 'evaluation' | 'target' | 'reversal';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100000000)
  amount!: number;
  @IsString() @MinLength(1) @MaxLength(1000)
  note!: string;
  @IsString() @MinLength(16) @MaxLength(64)
  requestId!: string;
  @IsOptional() @IsInt() @Min(1)
  reversesId?: number;
}
export class PayrollCafeChoiceDto {
  @IsBoolean() deduct!: boolean;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) expectedAmount!: number;
  @IsString() @MinLength(1) @MaxLength(1000) note!: string;
  @IsString() @MinLength(16) @MaxLength(64) requestId!: string;
}
export class CreatePayrollRunDto {
  @IsOptional() @IsDateString({ strict: true })
  payoutDate?: string;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2000)
  year!: number;
}

export class ListPayrollRunsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
