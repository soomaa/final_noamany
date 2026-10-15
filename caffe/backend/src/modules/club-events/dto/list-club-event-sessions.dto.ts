import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubEventSessionsDto extends PaginationDto {
  @IsOptional()
  @IsIn(['scheduled', 'ongoing', 'completed', 'cancelled', 'all'])
  status?: string;
}
