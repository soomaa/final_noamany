import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, IsDateString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
export const CONTACT_STATUSES = ['not_contacted', 'contacted', 'promised', 'not_interested'] as const;
export class RenewalFollowUpQuery extends PaginationDto {
  @IsOptional() @IsIn(['not_renewed', 'absent']) mode: 'not_renewed' | 'absent' = 'not_renewed';
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() packageKey?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) expiryFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) expiryTo?: string;
  @IsOptional() @IsIn(CONTACT_STATUSES) contactStatus?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) absenceDays = 14;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(36500) minDays?: number;
}
export class CreateSubscriptionFollowUpDto {
  @IsIn(CONTACT_STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) nextContactOn?: string;
}
