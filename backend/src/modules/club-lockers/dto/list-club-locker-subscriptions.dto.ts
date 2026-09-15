import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubLockerSubscriptionsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  mainBranchId?: string;

  @IsOptional()
  @IsString()
  subBranchId?: string;

  @IsOptional()
  @IsIn(['active', 'expired', 'upcoming', 'نشط', 'منتهي', 'قادم', 'all'])
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: string;
}
