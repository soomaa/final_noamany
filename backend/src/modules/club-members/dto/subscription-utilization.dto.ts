import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** «التزام الأعضاء»: attendance rate per subscription (ported from Meta Fit). */
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

  @IsOptional()
  @IsIn(['all', 'male', 'female'])
  gender?: string;

  /** Excel export: every matching row in one response instead of one page. */
  @IsOptional()
  @IsIn(['true', 'false'])
  allRows?: string;
}
