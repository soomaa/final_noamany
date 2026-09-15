import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubClassesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  trainer?: string;

  @IsOptional()
  @IsIn(['scheduled', 'ongoing', 'completed', 'cancelled', 'all'])
  status?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  classTypeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  personalOnly?: boolean;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  dateOrder?: 'asc' | 'desc';
}
