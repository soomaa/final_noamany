import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListJobRequestsDto extends PaginationDto {}

export class JobRequestDetailDto {
  @IsInt()
  type!: number;

  @IsString()
  title!: string;
}

export class CreateJobRequestDto {
  @IsOptional()
  @IsInt()
  depId?: number;

  @IsOptional()
  @IsInt()
  subDepId?: number;

  @IsOptional()
  @IsInt()
  jobTitleId?: number;

  @IsOptional()
  @IsInt()
  numForJob?: number;

  @IsOptional()
  @IsInt()
  jobType?: number;

  @IsOptional()
  @IsInt()
  jobNatural?: number;

  @IsOptional()
  @IsArray()
  details?: JobRequestDetailDto[];
}

export class UpdateJobRequestDto {
  @IsOptional()
  @IsInt()
  depId?: number;

  @IsOptional()
  @IsInt()
  subDepId?: number;

  @IsOptional()
  @IsInt()
  jobTitleId?: number;

  @IsOptional()
  @IsInt()
  numForJob?: number;

  @IsOptional()
  @IsInt()
  jobType?: number;

  @IsOptional()
  @IsInt()
  jobNatural?: number;

  @IsOptional()
  @IsArray()
  details?: JobRequestDetailDto[];
}

export class ListApplicationsDto extends PaginationDto {}
