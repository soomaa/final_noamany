import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SubscriptionUtilizationDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsIn(['active', 'expired', 'upcoming', 'frozen', 'all'])
  status: 'active' | 'expired' | 'upcoming' | 'frozen' | 'all' = 'active';

  @IsOptional()
  @IsIn(['high', 'medium', 'low', 'all'])
  rateBucket?: 'high' | 'medium' | 'low' | 'all';
}
