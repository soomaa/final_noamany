import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubLockerSubscriptionsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  mainBranchId?: string;

  @IsOptional()
  @IsString()
  subBranchId?: string;

  /** Restrict to one member's locker rentals (attendance/member desk lookup). */
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'all'])
  gender?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['active', 'expired', 'upcoming', 'نشط', 'منتهي', 'قادم', 'all'])
  status?: string;
}
