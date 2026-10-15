import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubEventsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn([
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'published',
    'ongoing',
    'completed',
    'closed',
    'cancelled',
    'all',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
