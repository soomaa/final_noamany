import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateCategoryDto { @IsString() @IsNotEmpty() name!: string; @Type(() => Number) @IsInt() jobTitleId!: number; }
export class UpdateCategoryDto { @IsOptional() @IsString() @IsNotEmpty() name?: string; @IsOptional() @Type(() => Number) @IsInt() jobTitleId?: number; }
export class CreateItemDto { @Type(() => Number) @IsInt() categoryId!: number; @IsString() @IsNotEmpty() name!: string; @IsString() maxScore!: string; }
export class UpdateItemDto { @IsOptional() @Type(() => Number) @IsInt() categoryId?: number; @IsOptional() @IsString() @IsNotEmpty() name?: string; @IsOptional() @IsString() maxScore?: string; }
export class EvaluationDetailDto { @Type(() => Number) @IsInt() itemId!: number; @IsString() awardedScore!: string; }
export class CreateEvaluationDto {
  @Type(() => Number) @IsInt() categoryId!: number;
  @Type(() => Number) @IsInt() employeeId!: number;
  @Type(() => Number) @IsInt() branchId!: number;
  @IsDateString() evaluationDate!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) evaluationMonth!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EvaluationDetailDto) details!: EvaluationDetailDto[];
}
export class UpdateEvaluationDto {
  @IsDateString() evaluationDate!: string;
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) evaluationMonth!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => EvaluationDetailDto) details!: EvaluationDetailDto[];
}
export class ListEvaluationQueryDto extends PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() categoryId?: number;
  @IsOptional() @Type(() => Number) @IsInt() employeeId?: number;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() search?: string;
}
