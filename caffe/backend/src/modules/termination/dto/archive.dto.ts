import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListArchiveDto extends PaginationDto {}

export class CreateArchiveDto {
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
  directManagerId?: string;

  @IsString()
  fromDate!: string;

  @IsString()
  toDate!: string;
}

export class UpdateArchiveDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  edaraId?: string;

  @IsOptional()
  @IsString()
  qsmId?: string;

  @IsOptional()
  @IsString()
  directManagerId?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;
}
