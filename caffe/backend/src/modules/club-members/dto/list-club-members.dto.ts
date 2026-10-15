import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubMembersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'all'])
  gender?: string;

  /** When true, returns all branch-scoped members for pickers (subscriptions, etc.). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  forSelect?: boolean;

  /** Include members created on or after this date (YYYY-MM-DD). */
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  /** Include members created on or before this date (YYYY-MM-DD, inclusive end-of-day). */
  @IsOptional()
  @IsISO8601()
  createdTo?: string;
}
