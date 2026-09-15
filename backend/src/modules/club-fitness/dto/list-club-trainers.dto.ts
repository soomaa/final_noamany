import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubTrainersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}

export class ListClubTrainerSalariesDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  trainerId?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}
