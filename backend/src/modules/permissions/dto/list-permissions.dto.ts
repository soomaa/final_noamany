import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListPermissionsDto extends PaginationDto {
  /** legacy tab: sader (mine) | wared (inbox, current_to_user_id == me) | accept | reject */
  @IsOptional()
  @IsString()
  @IsIn(['sader', 'wared', 'accept', 'reject'])
  mode?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
