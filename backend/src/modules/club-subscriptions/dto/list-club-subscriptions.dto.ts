import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubSubscriptionsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @IsString()
  subscriptionType?: string;

  @IsOptional()
  @IsIn(['active', 'expired', 'upcoming', 'frozen', 'all'])
  status?: string;

  /** Filter by member gender (رجال/حريم). */
  @IsOptional()
  @IsIn(['all', 'male', 'female'])
  gender?: string;

  @IsOptional()
  @IsString()
  isSpecial?: string;

  @IsOptional()
  @IsString()
  hasDiscount?: string;

  @IsOptional()
  @IsString()
  isTimeBased?: string;

  @IsOptional()
  @IsString()
  isLinkedToSessions?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  memberName?: string;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  endDateFrom?: string;

  @IsOptional()
  @IsString()
  endDateTo?: string;

  /** Start date filter — subscription_start_date >= this (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  startDateFrom?: string;

  @IsOptional()
  @IsString()
  startDateTo?: string;

  /** Convenience: expires within N days from today (e.g., 7 for "expiring soon"). */
  @IsOptional()
  @IsString()
  expiresWithinDays?: string;

  /** Expired tab: ended within the last N days (end date in [today-N, today-1]). */
  @IsOptional()
  @IsString()
  expiredWithinDays?: string;

  /** Expired tab: hide members who already hold a current or upcoming subscription. */
  @IsOptional()
  @IsIn(['true', 'false', '1', '0'])
  notRenewed?: string;

  /** Row order; default newest first (id desc). */
  @IsOptional()
  @IsIn(['endDateAsc', 'endDateDesc'])
  sort?: string;

  /** Filter by registration_date range (YYYY-MM-DD). */
  @IsOptional()
  @IsString()
  registrationDateFrom?: string;

  @IsOptional()
  @IsString()
  registrationDateTo?: string;
}
