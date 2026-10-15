import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
