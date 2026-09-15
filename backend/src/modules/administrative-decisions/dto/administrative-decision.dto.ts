import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListAdministrativeDecisionsDto extends PaginationDto {}

export class CreateAdministrativeDecisionDto {
  @IsString()
  empName!: string;

  @IsInt()
  edaraId!: number;

  @IsOptional()
  @IsInt()
  qsmId?: number;

  @IsOptional()
  @IsInt()
  directManagerId?: number;

  @IsInt()
  jobTitleId!: number;

  @IsNumber()
  @Min(0)
  salary!: number;

  @IsNumber()
  @Min(0)
  housingAllowance!: number;

  @IsNumber()
  @Min(0)
  transportAllowance!: number;

  @IsNumber()
  @Min(0)
  otherAllowance!: number;

  @IsDateString()
  workDate!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;
}

export class UpdateAdministrativeDecisionDto {
  @IsOptional()
  @IsString()
  empName?: string;

  @IsOptional()
  @IsInt()
  edaraId?: number;

  @IsOptional()
  @IsInt()
  qsmId?: number;

  @IsOptional()
  @IsInt()
  directManagerId?: number;

  @IsOptional()
  @IsInt()
  jobTitleId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  housingAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  transportAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherAllowance?: number;

  @IsOptional()
  @IsDateString()
  workDate?: string;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;
}
