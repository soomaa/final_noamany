import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListLeavesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @IsIn(['sader', 'wared', 'accept', 'reject'])
  mode?: string;

  @IsOptional()
  @IsString()
  status?: string;

}
