import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const FLOW_KINDS = ['leave', 'permission', 'overtime'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** «بانتظار الموافقة» inbox filters. */
export class InboxQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(['all', ...FLOW_KINDS])
  type?: 'all' | FlowKind;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null || value === 'all' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  /** manager | hr | dept | gm | returned */
  @IsOptional()
  @IsIn(['all', 'manager', 'hr', 'dept', 'gm', 'returned'])
  stage?: 'all' | 'manager' | 'hr' | 'dept' | 'gm' | 'returned';

  /** mine = only what is routed to me (default for non-HR); all = every open request (HR / admin). */
  @IsOptional()
  @IsIn(['all', 'mine'])
  scope?: 'all' | 'mine';
}

/** One decision from the unified request card. */
export class FlowActionDto {
  @IsIn(['accept', 'reject', 'return'])
  action!: 'accept' | 'reject' | 'return';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /** Leave partial approval (accept only). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}

/** Edit + resubmit from the unified card; only the fields of the request's kind are used. */
export class FlowResubmitDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  // leave
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) returnToWorkDate?: string;

  // permission
  @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value))) @IsInt() no3Ezn?: number;
  @IsOptional() @IsString() eznDate?: string;
  @IsOptional() @IsString() fromHour?: string;
  @IsOptional() @IsString() toHour?: string;
  @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value))) @IsInt() fatraFk?: number;

  // overtime
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsIn(['hours', 'shift']) kind?: 'hours' | 'shift';
  @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value))) @IsInt() hours?: number;
  @IsOptional() @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value))) @IsInt() shiftId?: number;

  // all kinds
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
