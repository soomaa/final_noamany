import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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

export class ListPayComponentsDto extends PaginationDto {
  @IsOptional()
  @IsIn(['allowance', 'deduction'])
  category?: 'allowance' | 'deduction';
}

export class CreatePayrollRunDto {
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

export class PayrollPreviewDto extends PaginationDto {
  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  branchId?: number;
}

export class CreateSalaryIncreaseDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  value!: number;

  @IsDateString()
  date!: string;
}

export class UpdateSalaryIncreaseDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  value?: number;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ListSalaryIncreasesDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class ApplySalaryOverridesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  privateBonus?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taqeemValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetValue?: number;
}
