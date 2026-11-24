import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { RESOLUTION_DECISIONS, ResolutionDecision } from '../resolutions.repo';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /attendance/exceptions — one day (`date`, default today) or a catch-up range (`from`/`to`). */
export class ListAttendanceExceptionsDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  /**
   * open = unresolved only, stale = unresolved and older than STALE_AFTER_DAYS («قديم مفتوح»),
   * resolved = resolved only, all (default).
   */
  @IsOptional()
  @IsIn(['all', 'open', 'stale', 'resolved'])
  status?: 'all' | 'open' | 'stale' | 'resolved';

  /**
   * Staff section: male = رجالي, female = حريمي, all = both. Omitted → the caller's default
   * (a men/women section manager opens on their own section, everyone else on all).
   */
  @IsOptional()
  @IsIn(['all', 'male', 'female'])
  gender?: 'all' | 'male' | 'female';
}

/** POST /attendance/exceptions/resolve */
export class ResolveAttendanceExceptionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  empCode!: number;

  @Matches(ISO_DATE, { message: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shiftId?: number;

  @IsIn(RESOLUTION_DECISIONS as unknown as string[], { message: 'القرار غير صحيح' })
  decision!: ResolutionDecision;

  /** Approximate arrival ("HH:mm" or "hh:mm AM"); required for `present` when the arrival is missing. */
  @IsOptional()
  @IsString()
  checkIn?: string;

  /** Approximate departure; required for `present` when the departure is missing. */
  @IsOptional()
  @IsString()
  checkOut?: string;

  @IsString()
  @IsNotEmpty({ message: 'السبب مطلوب' })
  @MaxLength(500)
  reason!: string;

  /** Required for `leave` (holiday_setting.id, e.g. 17 = بدون راتب). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  leaveTypeId?: number;
}
