import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubEventRegistrationsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsIn(['pending_payment', 'confirmed', 'waitlisted', 'cancelled', 'refunded', 'all'])
  status?: string;

  @IsOptional()
  @IsIn(['member', 'guest', 'lead'])
  registrantType?: string;

  @IsOptional()
  @IsString()
  branch?: string;
}
