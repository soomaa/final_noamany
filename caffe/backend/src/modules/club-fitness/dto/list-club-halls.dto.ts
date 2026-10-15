import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubHallsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['available', 'maintenance', 'unavailable', 'all'])
  status?: string;
}

export class ListClubHallBookingsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  hallId?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'active', 'completed', 'cancelled', 'all'])
  status?: string;
}
