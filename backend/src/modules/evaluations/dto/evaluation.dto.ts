import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListEvaluationsDto extends PaginationDto {}

export class EvaluationCriterionDto {
  @IsInt()
  settingId!: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  maxDegree!: string;

  @IsString()
  empDegree!: string;
}

export class CreateEvaluationDto {
  @IsInt()
  empId!: number;

  @IsOptional()
  @IsString()
  edaraId?: string;

  @IsOptional()
  @IsString()
  qsmId?: string;

  @IsOptional()
  @IsString()
  totalDegree?: string;

  @IsOptional()
  @IsString()
  resultTagraba?: string;

  @IsOptional()
  @IsString()
  taqdeer?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCriterionDto)
  criteria!: EvaluationCriterionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  positive?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  negative?: string[];
}
